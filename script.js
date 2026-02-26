import { saveLocal, updateUI, getDatosPacking, getEnsayosPorFecha, existeRegistroFechaEnsayo, getListadoRegistrados, getPackingCache, postPacking, STORAGE_KEY } from './network.js';

document.addEventListener('DOMContentLoaded', () => {

    // --- Inicio: aviso salir, iconos ---
    window.formHasChanges = false;
    if (window.lucide) lucide.createIcons();

    // --- Mapas de datos (variedades por casa) ---
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

    // --- Select variedad (desde VAR_MAP) ---
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

    // --- Sidebar y vistas (Nueva / Historial / Recomendaciones) ---
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
        if (view === 'historial') renderHistorial(true);
    }

    document.querySelectorAll('.nav-link').forEach(a => {
        a.addEventListener('click', (e) => {
            e.preventDefault();
            const view = a.getAttribute('data-view');
            if (view) setActiveView(view);
        });
    });

    // --- Validaciones de entrada y fecha local ---
    const trazLibre = document.getElementById('reg_traz_libre');
    if (trazLibre) {
        trazLibre.addEventListener('input', function() {
            this.value = this.value.toUpperCase();
        });
    }

    function fechaLocalHoy() {
        var d = new Date();
        var y = d.getFullYear();
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + day;
    }

    const campoFecha = document.getElementById('reg_fecha');
    if (campoFecha) {
        campoFecha.value = fechaLocalHoy();
    }
    // Horas de jarras y tiempos quedan libres (sin rellenar con hora actual)

    // --- Formulario: sin submit tradicional (todo por JS) ---
    if (cosechaForm) {
        cosechaForm.addEventListener('submit', (e) => {
            e.preventDefault();
        });
        cosechaForm.addEventListener('input', () => {
            window.formHasChanges = true;
        });
        cosechaForm.addEventListener('change', () => {
            window.formHasChanges = true;
        });
    }

    // --- Historial: paginación 8 por página y límite ~40 ítems para no sobrecargar ---
    var historialCurrentPage = 1;
    var HISTORIAL_PAGE_SIZE = 8;
    var HISTORIAL_MAX_ITEMS = 40;

    async function renderHistorial(shouldFetchListado, page) {
        if (page != null && page >= 1) historialCurrentPage = page;
        const contenedor = document.getElementById('historial-list');
        const contenedorServidor = document.getElementById('historial-servidor');
        if (!contenedor) return;

        if (shouldFetchListado && contenedorServidor && typeof getListadoRegistrados === 'function') {
            try {
                const res = await getListadoRegistrados();
                if (res.ok && Array.isArray(res.registrados) && res.registrados.length > 0) {
                    const porFecha = {};
                    res.registrados.forEach(r => {
                        const f = r.fecha || '';
                        if (!porFecha[f]) porFecha[f] = [];
                        porFecha[f].push({ num: r.ensayo_numero, nom: r.ensayo_nombre || ('Ensayo ' + r.ensayo_numero) });
                    });
                    const fechasOrd = Object.keys(porFecha).sort((a, b) => b.localeCompare(a));
                    contenedorServidor.innerHTML = '<div class="historial-table-wrapper"><table class="historial-table historial-table-servidor"><thead><tr><th>Fecha</th><th>Ensayos registrados</th></tr></thead><tbody>' +
                        fechasOrd.map(f => '<tr><td>' + f + '</td><td>' + (porFecha[f].map(e => e.num + ' (' + e.nom + ')').join(', ')) + '</td></tr>').join('') +
                        '</tbody></table></div>' + (res.fromCache ? '<p class="historial-cache-msg">Desde caché (actualiza al tener conexión).</p>' : '');
                } else {
                    contenedorServidor.innerHTML = '<div class="empty-state"><p>No hay registros en el servidor o sin conexión.</p>' + (res.fromCache ? ' <small>Datos desde caché.</small>' : '') + '</div>';
                }
            } catch (_) {
                contenedorServidor.innerHTML = '<div class="empty-state"><p>No se pudo cargar el listado (sin conexión o error).</p></div>';
            }
        }

        let items = JSON.parse(localStorage.getItem(STORAGE_KEY) || []);
        // Ordenar de más reciente a más antiguo (por timestamp)
        items.sort((a, b) => (new Date(b.timestamp || 0)).getTime() - (new Date(a.timestamp || 0)).getTime());
        // Limitar historial a ~40 ítems: eliminar los más antiguos para no sobrecargar
        if (items.length > HISTORIAL_MAX_ITEMS) {
            items = items.slice(0, HISTORIAL_MAX_ITEMS);
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch (e) {}
        }
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
                const estado = item.status === 'subido' ? 'subido' : (item.status === 'rechazado_duplicado' ? 'rechazado_duplicado' : 'pendiente');
                let horaSubida = item.subidoAt || '';
                if (!horaSubida && item.timestamp) {
                    const d = new Date(item.timestamp);
                    horaSubida = isNaN(d.getTime()) ? item.timestamp : d.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
                }
                (item.rows || []).forEach(row => {
                    const ensayoNum = row[12];
                    const ensayoNom = row[13] || ('Ensayo ' + ensayoNum);
                    const clave = `${ensayoNum}|${ensayoNom}`;
                    if (!ensayosMap[clave]) {
                        ensayosMap[clave] = { ensayoNum, ensayoNom, totalClamshells: 0, estados: new Set(), rechazoMotivo: null, horaSubida: '', timestamp: item.timestamp || '' };
                    }
                    ensayosMap[clave].totalClamshells += 1;
                    ensayosMap[clave].estados.add(estado);
                    if (estado === 'subido' && horaSubida) ensayosMap[clave].horaSubida = horaSubida;
                    if ((estado === 'pendiente' || estado === 'rechazado_duplicado') && horaSubida && !ensayosMap[clave].horaSubida) ensayosMap[clave].horaSubida = horaSubida;
                    if (item.status === 'rechazado_duplicado' && item.rechazoMotivo)
                        ensayosMap[clave].rechazoMotivo = item.rechazoMotivo;
                });
            });

            Object.values(ensayosMap).forEach(info => {
                const estadoFinal = info.estados.has('pendiente') ? 'pendiente' : info.estados.has('rechazado_duplicado') ? 'rechazado_duplicado' : 'subido';
                const claseEstado = estadoFinal === 'pendiente' ? 'hist-status-pendiente' : (estadoFinal === 'rechazado_duplicado' ? 'hist-status-rechazado' : 'hist-status-subido');
                const textoEstado = estadoFinal === 'pendiente' ? 'Pendiente' : (estadoFinal === 'rechazado_duplicado' ? 'No subido (ya registrado)' : 'Subido');
                const detalleMsg = estadoFinal === 'pendiente' ? 'En cola; se enviará cuando haya conexión.' : (estadoFinal === 'rechazado_duplicado' ? (info.rechazoMotivo || 'No se subió porque ya estaba registrado este ensayo para esta fecha.') : 'Registro enviado correctamente.');
                // Hora de subida para ordenar: subidoAt (hora real) o timestamp
                const horaSubidaStr = info.horaSubida || '';
                const ts = (info.timestamp || '').toString();
                let sortTime = new Date(ts || 0).getTime();
                if (horaSubidaStr && horaSubidaStr !== '—') {
                    if (horaSubidaStr.indexOf(',') >= 0) {
                        const d = new Date(horaSubidaStr);
                        if (!isNaN(d.getTime())) sortTime = d.getTime();
                    } else if (/^\d{1,2}:\d{2}/.test(horaSubidaStr)) {
                        const d = new Date(fecha + 'T' + horaSubidaStr.replace(/\./g, ':'));
                        if (!isNaN(d.getTime())) sortTime = d.getTime();
                    }
                }
                // Hora subida = momento local en que se subió (no la fecha del registro)
                const displayHoraSubida = info.horaSubida || '—';
                filasTabla.push({
                    fecha,
                    ensayoNum: info.ensayoNum,
                    ensayo: info.ensayoNom || ('Ensayo ' + info.ensayoNum),
                    clamshells: info.totalClamshells,
                    estado: textoEstado,
                    claseEstado,
                    detalleMsg,
                    horaSubida: displayHoraSubida,
                    timestamp: info.timestamp || '',
                    sortTime
                });
            });
        });

        // Ordenar filas por hora de subida: más reciente primero
        filasTabla.sort((a, b) => (b.sortTime || 0) - (a.sortTime || 0));

        // Paginación: 8 por página
        const totalFilas = filasTabla.length;
        const totalPages = Math.max(1, Math.ceil(totalFilas / HISTORIAL_PAGE_SIZE));
        historialCurrentPage = Math.min(Math.max(1, historialCurrentPage), totalPages);
        const start = (historialCurrentPage - 1) * HISTORIAL_PAGE_SIZE;
        const filasParaMostrar = filasTabla.slice(start, start + HISTORIAL_PAGE_SIZE);

        const thead = `
            <thead>
                <tr>
                    <th>Fecha</th>
                    <th>Ensayo</th>
                    <th>Clamshells</th>
                    <th>Estado</th>
                    <th>Hora subida</th>
                    <th>Acción</th>
                </tr>
            </thead>`;
        const escapeAttr = (s) => String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const tbody = '<tbody>' + filasParaMostrar.map(f => `
            <tr class="historial-row-clickable" data-detalle="${escapeAttr(f.detalleMsg)}" data-fecha="${escapeAttr(f.fecha)}" data-ensayo-num="${escapeAttr(String(f.ensayoNum))}" title="Toca para ver el detalle">
                <td>${f.fecha}</td>
                <td>${f.ensayo}</td>
                <td>${f.clamshells}</td>
                <td><span class="hist-status-badge ${f.claseEstado}">${f.estado}</span></td>
                <td>${f.horaSubida || '—'}</td>
                <td class="historial-cell-accion"><button type="button" class="btn-eliminar-envio" title="Quitar de la lista">Eliminar</button></td>
            </tr>
        `).join('') + '</tbody>';

        const paginationHtml = totalPages > 1 ? `
            <div class="historial-pagination">
                <button type="button" class="historial-pag-btn" data-page="prev" ${historialCurrentPage <= 1 ? 'disabled' : ''}>Anterior</button>
                <span class="historial-pag-info">Página ${historialCurrentPage} de ${totalPages}</span>
                <button type="button" class="historial-pag-btn" data-page="next" ${historialCurrentPage >= totalPages ? 'disabled' : ''}>Siguiente</button>
            </div>` : '';

        const table = document.createElement('div');
        table.className = 'historial-table-wrapper';
        table.innerHTML = `
            <table class="historial-table">
                ${thead}
                ${tbody}
            </table>
            ${paginationHtml}`;
        contenedor.appendChild(table);

        table.querySelectorAll('.historial-pag-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                if (this.disabled) return;
                const p = this.getAttribute('data-page');
                const nextPage = p === 'prev' ? historialCurrentPage - 1 : historialCurrentPage + 1;
                if (nextPage >= 1 && nextPage <= totalPages) renderHistorial(false, nextPage);
            });
        });

        table.querySelectorAll('.historial-row-clickable').forEach(tr => {
            tr.addEventListener('click', function (e) {
                if (e.target.closest('.btn-eliminar-envio')) return;
                const msg = this.getAttribute('data-detalle');
                if (msg && typeof Swal !== 'undefined') {
                    Swal.fire({
                        title: 'Detalle del registro',
                        text: msg,
                        icon: 'info',
                        confirmButtonColor: '#2f7cc0',
                        confirmButtonText: 'Entendido'
                    });
                }
            });
        });

        table.querySelectorAll('.btn-eliminar-envio').forEach(btn => {
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                const tr = this.closest('tr');
                if (!tr) return;
                const fecha = tr.getAttribute('data-fecha');
                const ensayoNum = tr.getAttribute('data-ensayo-num');
                if (fecha == null || ensayoNum == null) return;
                if (typeof Swal === 'undefined') {
                    eliminarEnvioDeHistorial(fecha, ensayoNum);
                    return;
                }
                Swal.fire({
                    title: '¿Quitar este envío de la lista?',
                    html: 'Se quitará de tu historial local.<br><small>No se borra en el servidor.</small>',
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonColor: '#d33',
                    cancelButtonColor: '#6c757d',
                    confirmButtonText: 'Sí, quitar'
                }).then((result) => {
                    if (result.isConfirmed) {
                        eliminarEnvioDeHistorial(fecha, ensayoNum);
                        renderHistorial(false);
                        updateUI();
                    }
                });
            });
        });
    }

    function eliminarEnvioDeHistorial(fecha, ensayoNum) {
        const items = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        const normalizar = (v) => (v == null || v === '') ? '' : String(v).trim();
        const fn = normalizar(fecha);
        const en = normalizar(ensayoNum);
        const nuevos = [];
        for (const item of items) {
            const rows = (item.rows || []).filter(r => normalizar(r[0]) !== fn || normalizar(r[12]) !== en);
            if (rows.length > 0) nuevos.push({ ...item, rows });
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(nuevos));
        window.dispatchEvent(new CustomEvent('tiemposStorageUpdated'));
    }

    window.addEventListener('tiemposStorageUpdated', () => {
        const v = document.getElementById('view-historial');
        if (v && v.style.display !== 'none') renderHistorial(false);
    });

    document.getElementById('historial-btn-refresh')?.addEventListener('click', () => {
        renderHistorial(true);
    });

    // --- Tipo medición (Visual/Packing), wrappers, datosEnsayos ---
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
    const rotuloEnsayoWrapper = document.getElementById('rotulo_ensayo_wrapper');
    const btnGuardarRegistro = document.getElementById('btn-guardar-registro');
    const btnGuardarPacking = document.getElementById('btn-guardar-packing');

    const datosEnsayos = {
        visual: {
            1: { formHeader: null, visual: [], jarras: [], temperaturas: [], tiempos: [], humedad: [], presionambiente: [], presionfruta: [], observacion: [] },
            2: { formHeader: null, visual: [], jarras: [], temperaturas: [], tiempos: [], humedad: [], presionambiente: [], presionfruta: [], observacion: [] },
            3: { formHeader: null, visual: [], jarras: [], temperaturas: [], tiempos: [], humedad: [], presionambiente: [], presionfruta: [], observacion: [] },
            4: { formHeader: null, visual: [], jarras: [], temperaturas: [], tiempos: [], humedad: [], presionambiente: [], presionfruta: [], observacion: [] }
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

    // --- Helpers validación (números, tiempos) ---
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

    // --- Cambio tipo (Visual/Packing) y cambio ensayo ---
    if (selectMedicion) {
        selectMedicion.addEventListener('change', async function() {
            const newTipo = this.value;
            tipoActual = newTipo;
            
            if (this.value === 'visual') {
                if (rotuloEnsayoWrapper) rotuloEnsayoWrapper.style.display = 'block';
                if (viewVisualContainer) viewVisualContainer.style.display = 'block';
                if (viewPackingContainer) viewPackingContainer.style.display = 'none';
                if (btnGuardarRegistro) btnGuardarRegistro.style.display = 'block';
                if (btnGuardarPacking) btnGuardarPacking.style.display = 'none';
                wrappers.visual.style.display = 'block';
                wrappers.jarras.style.display = 'block';
                wrappers.temperaturas.style.display = 'block';
                wrappers.tiempos.style.display = 'block';
                wrappers.humedad.style.display = 'block';
                wrappers.presionambiente.style.display = 'block';
                wrappers.presionfruta.style.display = 'block';
                wrappers.observacion.style.display = 'block';
                var selRotulo = document.getElementById('reg_rotulo_ensayo');
                if (selRotulo) selRotulo.setAttribute('required', 'required');
            } else if (this.value === 'packing') {
                if (rotuloEnsayoWrapper) rotuloEnsayoWrapper.style.display = 'none';
                if (viewVisualContainer) viewVisualContainer.style.display = 'none';
                if (viewPackingContainer) viewPackingContainer.style.display = 'block';
                if (btnGuardarRegistro) btnGuardarRegistro.style.display = 'none';
                if (btnGuardarPacking) btnGuardarPacking.style.display = 'block';
                wrappers.visual.style.display = 'none';
                wrappers.jarras.style.display = 'none';
                wrappers.temperaturas.style.display = 'none';
                wrappers.tiempos.style.display = 'none';
                wrappers.humedad.style.display = 'none';
                wrappers.presionambiente.style.display = 'none';
                wrappers.presionfruta.style.display = 'none';
                var selRotulo = document.getElementById('reg_rotulo_ensayo');
                if (selRotulo) selRotulo.removeAttribute('required');
            }
            
            if (ensayoActual) {
                restaurarDatosEnsayo(tipoActual, ensayoActual);
            }
        });
    }

    function guardarFormHeaderEnEnsayo(ensayo) {
        if (!ensayo || !datosEnsayos.visual[ensayo]) return;
        const el = function(id) { var e = document.getElementById(id); return e ? (e.value || '').trim() : ''; };
        datosEnsayos.visual[ensayo].formHeader = {
            fecha: el('reg_fecha'),
            responsable: el('reg_responsable'),
            guia_remision: el('reg_guia_remision'),
            variedad: el('reg_variedad'),
            placa: el('reg_placa'),
            hora_inicio: el('reg_hora_inicio'),
            dias_precosecha: el('reg_dias_precosecha'),
            traz_etapa: el('reg_traz_etapa'),
            traz_campo: el('reg_traz_campo'),
            traz_libre: el('reg_traz_libre'),
            fundo: el('reg_fundo'),
            observacion: el('reg_observacion_formato')
        };
    }
    function restaurarFormHeaderDesdeEnsayo(ensayo) {
        if (!ensayo || !datosEnsayos.visual[ensayo]) return;
        const h = datosEnsayos.visual[ensayo].formHeader;
        function set(id, val) { var e = document.getElementById(id); if (e) e.value = val != null ? val : ''; }
        if (h) {
            set('reg_fecha', h.fecha);
            set('reg_responsable', h.responsable);
            set('reg_guia_remision', h.guia_remision);
            set('reg_variedad', h.variedad);
            set('reg_placa', h.placa);
            set('reg_hora_inicio', h.hora_inicio || '07:15');
            set('reg_dias_precosecha', h.dias_precosecha);
            set('reg_traz_etapa', h.traz_etapa);
            set('reg_traz_campo', h.traz_campo);
            set('reg_traz_libre', h.traz_libre);
            set('reg_fundo', h.fundo);
            set('reg_observacion_formato', h.observacion);
        } else {
            set('reg_fecha', '');
            set('reg_responsable', '');
            set('reg_guia_remision', '');
            set('reg_variedad', '');
            set('reg_placa', '');
            set('reg_hora_inicio', '07:15');
            set('reg_dias_precosecha', '');
            set('reg_traz_etapa', '');
            set('reg_traz_campo', '');
            set('reg_traz_libre', '');
            set('reg_fundo', '');
            set('reg_observacion_formato', '');
        }
    }

    if (selectRotulo) {
        selectRotulo.addEventListener('change', async function() {
            const newEnsayo = this.value;
            if (ensayoActual) guardarFormHeaderEnEnsayo(ensayoActual);
            ensayoActual = newEnsayo;
            restaurarFormHeaderDesdeEnsayo(ensayoActual);
            if (tipoActual) {
                restaurarDatosEnsayo(tipoActual, ensayoActual);
            }
        });
    }

    // --- PACKING: helpers fecha/variedad, select ensayo, cargar datos, sync vista ---
    function formatearFechaParaVer(yyyyMmDd) {
        if (!yyyyMmDd || typeof yyyyMmDd !== 'string') return yyyyMmDd || '';
        var parts = yyyyMmDd.trim().split('-');
        if (parts.length !== 3) return yyyyMmDd;
        return parts[2] + '/' + parts[1] + '/' + parts[0];
    }

    function valorParaSelect(val) {
        if (val === null || val === undefined || val === '') return '';
        var s = String(val).trim();
        if (!s) return '';
        var n = Number(s);
        if (!Number.isNaN(n) && Number.isInteger(n)) return String(n);
        return s;
    }

    function getNombreVariedad(id) {
        if (id === null || id === undefined || id === '') return '';
        var key = String(id).trim();
        for (var casa in VAR_MAP) {
            if (VAR_MAP[casa][key]) return VAR_MAP[casa][key];
        }
        return key;
    }

    const inputFechaPacking = document.getElementById('view_fecha');
    const selEnsayoPacking = document.getElementById('view_ensayo_numero');
    var spinnerEnsayos = document.getElementById('spinner_ensayos');
    var rowFechaEnsayo = document.querySelector('.packing-fecha-ensayo-row');
    var sectionDatos = document.getElementById('packing_datos_section');
    var msgNoEnsayos = document.getElementById('view_no_ensayos_msg');
    var packingYaEnviadoPorFecha = {};
    var packingBloqueadoParaActual = false;
    var numFilasEsperadoPorFechaEnsayo = {};
    if (inputFechaPacking && selEnsayoPacking) {
        selEnsayoPacking.addEventListener('change', async function () {
            const fecha = (inputFechaPacking.value || '').trim();
            const newEnsayo = (selEnsayoPacking.value || '').trim();
            if (currentFechaPacking && currentEnsayoPacking) guardarPackingEnStore(currentFechaPacking, currentEnsayoPacking);
            currentFechaPacking = fecha;
            currentEnsayoPacking = newEnsayo;
            if (fecha && newEnsayo) {
                restaurarPackingDesdeStore(fecha, newEnsayo);
                try {
                    // skipCache=true: numFilas debe venir siempre del GET (cuenta filas con misma FECHA + ENSAYO_NUMERO en la hoja)
                    var res = await getDatosPacking(fecha, newEnsayo, true);
                    if (res.ok && res.data) aplicarDatosVistaPacking(res.data, res.fromCache);
                } catch (_) {}
            }
            if (newEnsayo && datosEnsayos && datosEnsayos.visual && datosEnsayos.visual[newEnsayo] && Array.isArray(datosEnsayos.visual[newEnsayo].visual) && datosEnsayos.visual[newEnsayo].visual.length > 0) {
                maxFilasPacking = datosEnsayos.visual[newEnsayo].visual.length;
            }
        });
        inputFechaPacking.addEventListener('change', async function () {
            var fecha = (inputFechaPacking.value || '').trim();
            currentFechaPacking = fecha;
            currentEnsayoPacking = '';
            selEnsayoPacking.innerHTML = '<option value="" disabled selected>Seleccione ensayo...</option>';
            selEnsayoPacking.value = '';
            if (msgNoEnsayos) msgNoEnsayos.style.display = 'none';
            if (!fecha) {
                selEnsayoPacking.querySelector('option').textContent = 'Seleccione fecha primero...';
                return;
            }
            if (spinnerEnsayos) { spinnerEnsayos.style.display = 'inline-block'; }
            selEnsayoPacking.disabled = true;
            if (rowFechaEnsayo) rowFechaEnsayo.classList.add('is-loading');
            try {
                var res = await getEnsayosPorFecha(fecha);
                packingYaEnviadoPorFecha[fecha] = (res.ensayosConPacking && typeof res.ensayosConPacking === 'object') ? res.ensayosConPacking : {};
                selEnsayoPacking.innerHTML = '<option value="" disabled selected>Seleccione ensayo...</option>';
                if (res.ok && res.ensayos && res.ensayos.length > 0) {
                    res.ensayos.forEach(function (n) {
                        var opt = document.createElement('option');
                        opt.value = n;
                        var tienePacking = packingYaEnviadoPorFecha[fecha] && packingYaEnviadoPorFecha[fecha][n];
                        opt.textContent = 'Ensayo ' + n + (tienePacking ? ' (Packing ✔)' : '');
                        if (tienePacking) opt.disabled = true;
                        selEnsayoPacking.appendChild(opt);
                    });
                } else {
                    if (msgNoEnsayos) msgNoEnsayos.style.display = 'flex';
                }
            } catch (_) {
                selEnsayoPacking.innerHTML = '<option value="" disabled selected>Sin conexión. Elige fecha y prueba de nuevo.</option>';
            } finally {
                selEnsayoPacking.disabled = false;
                if (spinnerEnsayos) { spinnerEnsayos.style.display = 'none'; }
                if (rowFechaEnsayo) rowFechaEnsayo.classList.remove('is-loading');
            }
        });
    }

    const btnCargarDatos = document.getElementById('btn_cargar_datos');
    var spinnerCargar = document.getElementById('spinner_cargar');
    var btnCargarText = document.querySelector('.btn-cargar-text');
    if (btnCargarDatos) {
        btnCargarDatos.addEventListener('click', async function () {
            const fechaEl = document.getElementById('view_fecha');
            const ensayoEl = document.getElementById('view_ensayo_numero');
            const fecha = fechaEl && fechaEl.value ? fechaEl.value.trim() : '';
            const ensayoNumero = ensayoEl && ensayoEl.value ? ensayoEl.value.trim() : '';
            if (!fecha || !ensayoNumero) {
                Swal.fire({ title: 'Faltan datos', text: 'Elige fecha y ensayo para cargar.', icon: 'warning' });
                return;
            }
            if (currentFechaPacking && currentEnsayoPacking) guardarPackingEnStore(currentFechaPacking, currentEnsayoPacking);
            if (spinnerCargar) spinnerCargar.style.display = 'inline-block';
            if (btnCargarText) btnCargarText.textContent = 'Cargando...';
            btnCargarDatos.disabled = true;
            if (rowFechaEnsayo) rowFechaEnsayo.classList.add('is-loading');
            if (sectionDatos) sectionDatos.classList.add('is-loading');
            try {
                // skipCache=true para obtener numFilas actualizado del servidor (evitar caché con valor antiguo)
                const res = await getDatosPacking(fecha, ensayoNumero, true);
                if (!res.ok || !res.data) {
                    Swal.fire({ title: 'Sin datos', text: res.error || 'No hay registro para esa fecha y ensayo.', icon: 'info' });
                    return;
                }
                const d = res.data;
                aplicarDatosVistaPacking(d, res.fromCache);
                currentFechaPacking = fecha;
                currentEnsayoPacking = ensayoNumero;
                restaurarPackingDesdeStore(fecha, ensayoNumero);
                Swal.fire({ title: res.fromCache ? 'Datos cargados (caché)' : 'Datos cargados', icon: 'success', timer: 1500, showConfirmButton: false });
            } catch (err) {
                Swal.fire({ title: 'Error', text: err.message || 'No se pudo cargar.', icon: 'error' });
            } finally {
                if (spinnerCargar) spinnerCargar.style.display = 'none';
                if (btnCargarText) btnCargarText.textContent = 'Cargar datos';
                btnCargarDatos.disabled = false;
                if (rowFechaEnsayo) rowFechaEnsayo.classList.remove('is-loading');
                if (sectionDatos) sectionDatos.classList.remove('is-loading');
            }
        });
    }

    (function () {
        var vEtapa = document.getElementById('view_etapa');
        var vCampo = document.getElementById('view_campo');
        if (vEtapa) vEtapa.addEventListener('change', function () { var v = this.getAttribute('data-last-value'); if (v !== null && v !== '') this.value = v; });
        if (vCampo) vCampo.addEventListener('change', function () { var v = this.getAttribute('data-last-value'); if (v !== null && v !== '') this.value = v; });
    })();

    (function syncVistaInicial() {
        const v = selectMedicion ? selectMedicion.value : '';
        if (v === 'packing') {
            if (viewVisualContainer) viewVisualContainer.style.display = 'none';
            if (viewPackingContainer) viewPackingContainer.style.display = 'block';
            if (btnGuardarRegistro) btnGuardarRegistro.style.display = 'none';
            if (btnGuardarPacking) btnGuardarPacking.style.display = 'block';
            if (inputFechaPacking && inputFechaPacking.value) inputFechaPacking.dispatchEvent(new Event('change'));
        } else {
            if (viewVisualContainer) viewVisualContainer.style.display = 'block';
            if (viewPackingContainer) viewPackingContainer.style.display = 'none';
            if (btnGuardarRegistro) btnGuardarRegistro.style.display = 'block';
            if (btnGuardarPacking) btnGuardarPacking.style.display = 'none';
        }
    })();

    // --- PACKING: datos por fila (referencia = packing2.length), agregar/editar/eliminar/replicar, envío console ---
    const datosPacking = {
        packing1: [],
        packing2: [],
        packing3: [],
        packing4: [],
        packing5: [],
        packing6: [],
        packing7: [],
        packing8: []
    };

    /** Packing por (fecha, ensayo): al cambiar de ensayo se guarda y se restaura, como en Calibrado Visual. Límite para mantener la app ligera. */
    const datosPackingPorEnsayo = {};
    var datosPackingPorEnsayoKeysOrder = [];
    var MAX_PACKING_STORE_KEYS = 20;
    let currentFechaPacking = '';
    let currentEnsayoPacking = '';

    function keyPacking(fecha, ensayo) {
        return (fecha || '') + '_' + (ensayo || '');
    }

    function guardarPackingEnStore(fecha, ensayo) {
        if (!fecha || !ensayo) return;
        var h = document.getElementById('view_hora_recepcion');
        var n = document.getElementById('view_n_viaje');
        const key = keyPacking(fecha, ensayo);
        datosPackingPorEnsayo[key] = {
            maxFilasPacking: maxFilasPacking,
            hora_recepcion: h ? (h.value || '').trim() : '',
            n_viaje: n ? (n.value || '').trim() : '',
            packing1: datosPacking.packing1.map(function (x) { return { ...x }; }),
            packing2: datosPacking.packing2.map(function (x) { return { ...x }; }),
            packing3: datosPacking.packing3.map(function (x) { return { ...x }; }),
            packing4: datosPacking.packing4.map(function (x) { return { ...x }; }),
            packing5: datosPacking.packing5.map(function (x) { return { ...x }; }),
            packing6: datosPacking.packing6.map(function (x) { return { ...x }; }),
            packing7: datosPacking.packing7.map(function (x) { return { ...x }; }),
            packing8: datosPacking.packing8.map(function (x) { return { ...x }; })
        };
        if (datosPackingPorEnsayoKeysOrder.indexOf(key) === -1) datosPackingPorEnsayoKeysOrder.push(key);
        while (datosPackingPorEnsayoKeysOrder.length > MAX_PACKING_STORE_KEYS) {
            var oldKey = datosPackingPorEnsayoKeysOrder.shift();
            delete datosPackingPorEnsayo[oldKey];
        }
    }

    function restaurarPackingDesdeStore(fecha, ensayo) {
        const key = keyPacking(fecha, ensayo);
        const stored = datosPackingPorEnsayo[key];
        var setView = function (id, val) {
            var el = document.getElementById(id);
            if (el) el.value = (val != null && val !== '') ? String(val).trim() : '';
        };
        if (!stored) {
            setView('view_hora_recepcion', '');
            setView('view_n_viaje', '');
            ['packing1', 'packing2', 'packing3', 'packing4', 'packing5', 'packing6', 'packing7', 'packing8'].forEach(function (k) { datosPacking[k] = []; });
            renderAllPackingRows();
            actualizarTodosContadoresPacking();
            return;
        }
        setView('view_hora_recepcion', stored.hora_recepcion);
        setView('view_n_viaje', stored.n_viaje);
        if (stored.maxFilasPacking != null && stored.maxFilasPacking > 0) maxFilasPacking = stored.maxFilasPacking;
        ['packing1', 'packing2', 'packing3', 'packing4', 'packing5', 'packing6', 'packing7', 'packing8'].forEach(function (k) {
            datosPacking[k] = (stored[k] || []).map(function (x) { return { ...x }; });
        });
        renderAllPackingRows();
        actualizarTodosContadoresPacking();
    }

    /** Rellena los campos de vista (solo lectura) y maxFilasPacking desde la respuesta del GET. Si tienePacking, bloquea envío. */
    function aplicarDatosVistaPacking(d, fromCache) {
        if (!d) return;
        console.log('[Packing] aplicarDatosVistaPacking: numFilas=' + (d.numFilas != null ? d.numFilas : 'n/a') + (fromCache ? ' (desde caché)' : ' (desde servidor)'));
        if (d.numFilas != null && d.numFilas > 0) maxFilasPacking = d.numFilas;
        if (typeof currentFechaPacking !== 'undefined' && typeof currentEnsayoPacking !== 'undefined') {
            var keyFeEn = keyPacking(currentFechaPacking, currentEnsayoPacking);
            if (keyFeEn) numFilasEsperadoPorFechaEnsayo[keyFeEn] = (d.numFilas != null && d.numFilas > 0) ? d.numFilas : null;
        }
        packingBloqueadoParaActual = d.tienePacking === true;
        if (btnGuardarPacking) {
            btnGuardarPacking.disabled = packingBloqueadoParaActual;
            if (packingBloqueadoParaActual && typeof Swal !== 'undefined') {
                Swal.fire({
                    title: 'Ya trabajado',
                    text: 'Ya existe información de packing para esta fecha y ensayo. No se puede subir más. Elige otra fecha o ensayo.',
                    icon: 'info',
                    confirmButtonColor: '#2f7cc0'
                });
            }
        }
        const set = function (id, val) {
            var el = document.getElementById(id);
            if (!el) return;
            el.value = (val != null && val !== '') ? String(val).trim() : '';
        };
        const setSelect = function (id, val) {
            var el = document.getElementById(id);
            if (!el) return;
            var v = valorParaSelect(val);
            if (v && !Array.from(el.options).some(function (o) { return o.value === v; })) {
                var opt = document.createElement('option');
                opt.value = v;
                opt.textContent = v;
                el.appendChild(opt);
            }
            el.value = v;
        };
        setSelect('view_etapa', d.TRAZ_ETAPA);
        setSelect('view_campo', d.TRAZ_CAMPO);
        var elEtapa = document.getElementById('view_etapa');
        var elCampo = document.getElementById('view_campo');
        if (elEtapa) elEtapa.setAttribute('data-last-value', valorParaSelect(d.TRAZ_ETAPA));
        if (elCampo) elCampo.setAttribute('data-last-value', valorParaSelect(d.TRAZ_CAMPO));
        set('view_turno', d.TRAZ_LIBRE);
        set('view_placa', d.PLACA_VEHICULO);
        set('view_guia_despacho', d.GUIA_REMISION);
        var nEnsayo = d.ENSAYO_NUMERO != null && d.ENSAYO_NUMERO !== '' ? String(d.ENSAYO_NUMERO).trim() : '';
        set('view_rotulo', nEnsayo ? nEnsayo + ' (Ensayo-' + nEnsayo + ')' : '');
        var variedadId = (d.VARIEDAD != null && d.VARIEDAD !== '') ? String(d.VARIEDAD).trim() : '';
        var variedadNombre = getNombreVariedad(d.VARIEDAD);
        var viewVar = document.getElementById('view_variedad');
        var regVar = document.getElementById('reg_variedad');
        if (viewVar) viewVar.value = variedadNombre;
        if (regVar) regVar.value = variedadId;
    }

    /** Límite máximo de filas de packing (por ensayo). Se actualiza al cargar datos o al elegir ensayo con datos Visual. */
    let maxFilasPacking = 8;

    function getPackingRowCount() {
        const len = Math.max(
            datosPacking.packing1.length,
            datosPacking.packing2.length,
            datosPacking.packing3.length,
            datosPacking.packing4.length,
            datosPacking.packing5.length,
            datosPacking.packing6.length,
            datosPacking.packing7.length,
            datosPacking.packing8.length
        );
        return len;
    }

    const emptiesPacking = {
        packing1: { recepcion: '', ingreso_gasificado: '', salida_gasificado: '', ingreso_prefrio: '', salida_prefrio: '' },
        packing2: { peso_recepcion: '', peso_ingreso_gasificado: '', peso_salida_gasificado: '', peso_ingreso_prefrio: '', peso_salida_prefrio: '' },
        packing3: { t_amb_recep: '', t_pulp_recep: '', t_amb_ing: '', t_pulp_ing: '', t_amb_sal: '', t_pulp_sal: '', t_amb_pre_in: '', t_pulp_pre_in: '', t_amb_pre_out: '', t_pulp_pre_out: '' },
        packing4: { recepcion: '', ingreso_gasificado: '', salida_gasificado: '', ingreso_prefrio: '', salida_prefrio: '' },
        packing5: { recepcion: '', ingreso_gasificado: '', salida_gasificado: '', ingreso_prefrio: '', salida_prefrio: '' },
        packing6: { recepcion: '', ingreso_gasificado: '', salida_gasificado: '', ingreso_prefrio: '', salida_prefrio: '' },
        packing7: { recepcion: '', ingreso_gasificado: '', salida_gasificado: '', ingreso_prefrio: '', salida_prefrio: '' },
        packing8: { observacion: '' }
    };

    /** Comprueba si en ESA sección se puede agregar otra fila. packing2 (Pesos) limita por maxFilasPacking; el resto por packing2.length. */
    /** Packing 1 y 2 se llenan libres (dinámicos). Packing 3-8 requieren al menos una fila en Packing 1 o 2; su tope es packing2.length. */
    function canAgregarFilaPacking(sectionKey) {
        const arr = datosPacking[sectionKey];
        if (!arr) return true;
        // wrapper_packing_1 y wrapper_packing_2: sin validar "primero Pesos"; pueden llenar libremente.
        if (sectionKey === 'packing1') {
            const limite = datosPacking.packing2.length > 0 ? datosPacking.packing2.length : maxFilasPacking;
            if (arr.length >= limite) {
                Swal.fire({
                    title: 'Límite alcanzado',
                    text: `Ya tienes ${limite} registros (máximo permitido según ${datosPacking.packing2.length > 0 ? 'Pesos' : 'N° Clamshells'}).`,
                    icon: 'info',
                    confirmButtonColor: '#2f7cc0'
                });
                return false;
            }
            return true;
        }
        if (sectionKey === 'packing2') {
            if (arr.length >= maxFilasPacking) {
                Swal.fire({
                    title: 'Límite alcanzado',
                    text: `Ya tienes ${maxFilasPacking} registros (máximo permitido según N° Clamshells).`,
                    icon: 'info',
                    confirmButtonColor: '#2f7cc0'
                });
                return false;
            }
            return true;
        }
        // wrapper_packing_3 a 8: deben tener al menos una fila en Packing 1 o Packing 2 para poder agregar.
        const hayBase = datosPacking.packing1.length > 0 || datosPacking.packing2.length > 0;
        if (!hayBase) {
            Swal.fire({
                title: 'Atención',
                text: 'Primero agrega al menos una fila en Tiempos (Packing 1) o en Pesos (Packing 2).',
                icon: 'warning',
                confirmButtonColor: '#2f7cc0'
            });
            return false;
        }
        const limite = datosPacking.packing2.length;
        if (arr.length >= limite) {
            Swal.fire({
                title: 'Límite alcanzado',
                text: `Ya tienes ${limite} registros (máximo permitido según Pesos).`,
                icon: 'info',
                confirmButtonColor: '#2f7cc0'
            });
            return false;
        }
        return true;
    }

    // Solo rellena hasta n copiando la última fila; nunca crea filas vacías. Si una sección tiene 0 filas, no se agrega nada.
    function sincronizarFilasPacking() {
        const n = getPackingRowCount();
        ['packing1', 'packing2', 'packing3', 'packing4', 'packing5', 'packing6', 'packing7', 'packing8'].forEach(k => {
            const arr = datosPacking[k];
            while (arr.length < n) {
                if (arr.length > 0) arr.push({ ...arr[arr.length - 1] });
                else break;
            }
        });
        renderAllPackingRows();
        actualizarTodosContadoresPacking();
    }

    /** Actualiza cada contador con la cantidad de filas de SU sección (cada wrapper independiente: vacío = siguiente 1). */
    function actualizarTodosContadoresPacking() {
        actualizarContadorPacking('next_clam_packing', datosPacking.packing1.length);
        actualizarContadorPacking('next_clam_pesos', datosPacking.packing2.length);
        actualizarContadorPacking('next_clam_packing_temp', datosPacking.packing3.length);
        actualizarContadorPacking('next_clam_packing_humedad', datosPacking.packing4.length);
        actualizarContadorPacking('next_clam_packing_presion', datosPacking.packing5.length);
        actualizarContadorPacking('next_clam_packing_presion_fruta', datosPacking.packing6.length);
        actualizarContadorPacking('next_clam_deficit', datosPacking.packing7.length);
        actualizarContadorPacking('next_clam_packing_obs', datosPacking.packing8.length);
    }

    function actualizarContadorPacking(contadorId, valor) {
        const el = document.getElementById(contadorId);
        if (el) el.textContent = valor + 1;
    }

    // Orden de columnas packing por fila lógica (41 valores): p1(5), p2(5), p3(10), p4(5), p5(5), p6(5), p7(5), p8(1). Fila 1 va primero, luego fila 2, etc.
    function buildPackingRows() {
        const n = getPackingRowCount();
        const rows = [];
        for (let i = 0; i < n; i++) {
            const p1 = datosPacking.packing1[i] || {};
            const p2 = datosPacking.packing2[i] || {};
            const p3 = datosPacking.packing3[i] || {};
            const p4 = datosPacking.packing4[i] || {};
            const p5 = datosPacking.packing5[i] || {};
            const p6 = datosPacking.packing6[i] || {};
            const p7 = datosPacking.packing7[i] || {};
            const p8 = datosPacking.packing8[i] || {};
            const v = (x) => (x != null && x !== '') ? x : '';
            rows.push([
                v(p1.recepcion), v(p1.ingreso_gasificado), v(p1.salida_gasificado), v(p1.ingreso_prefrio), v(p1.salida_prefrio),
                v(p2.peso_recepcion), v(p2.peso_ingreso_gasificado), v(p2.peso_salida_gasificado), v(p2.peso_ingreso_prefrio), v(p2.peso_salida_prefrio),
                v(p3.t_amb_recep), v(p3.t_pulp_recep), v(p3.t_amb_ing), v(p3.t_pulp_ing), v(p3.t_amb_sal), v(p3.t_pulp_sal), v(p3.t_amb_pre_in), v(p3.t_pulp_pre_in), v(p3.t_amb_pre_out), v(p3.t_pulp_pre_out),
                v(p4.recepcion), v(p4.ingreso_gasificado), v(p4.salida_gasificado), v(p4.ingreso_prefrio), v(p4.salida_prefrio),
                v(p5.recepcion), v(p5.ingreso_gasificado), v(p5.salida_gasificado), v(p5.ingreso_prefrio), v(p5.salida_prefrio),
                v(p6.recepcion), v(p6.ingreso_gasificado), v(p6.salida_gasificado), v(p6.ingreso_prefrio), v(p6.salida_prefrio),
                v(p7.recepcion), v(p7.ingreso_gasificado), v(p7.salida_gasificado), v(p7.ingreso_prefrio), v(p7.salida_prefrio),
                v(p8.observacion)
            ]);
        }
        return rows;
    }

    function getPackingRowCountFromStored(stored) {
        if (!stored) return 0;
        var len = 0;
        ['packing1', 'packing2', 'packing3', 'packing4', 'packing5', 'packing6', 'packing7', 'packing8'].forEach(function (k) {
            var arr = stored[k];
            if (arr && arr.length > len) len = arr.length;
        });
        return len;
    }

    /** Comprueba que las 8 secciones de packing tengan la misma cantidad de filas. */
    function validarConsistenciaFilasPacking(stored) {
        if (!stored) return { ok: true };
        var keys = ['packing1', 'packing2', 'packing3', 'packing4', 'packing5', 'packing6', 'packing7', 'packing8'];
        var len0 = (stored.packing1 && stored.packing1.length) || 0;
        for (var i = 1; i < keys.length; i++) {
            var L = (stored[keys[i]] && stored[keys[i]].length) || 0;
            if (L !== len0) return { ok: false, lengths: keys.map(function (k) { return (stored[k] && stored[k].length) || 0; }) };
        }
        return { ok: true };
    }

    function buildPackingRowsFromStored(stored) {
        var n = getPackingRowCountFromStored(stored);
        var rows = [];
        var v = function (x) { return (x != null && x !== '') ? x : ''; };
        for (var i = 0; i < n; i++) {
            var p1 = (stored.packing1 && stored.packing1[i]) || {};
            var p2 = (stored.packing2 && stored.packing2[i]) || {};
            var p3 = (stored.packing3 && stored.packing3[i]) || {};
            var p4 = (stored.packing4 && stored.packing4[i]) || {};
            var p5 = (stored.packing5 && stored.packing5[i]) || {};
            var p6 = (stored.packing6 && stored.packing6[i]) || {};
            var p7 = (stored.packing7 && stored.packing7[i]) || {};
            var p8 = (stored.packing8 && stored.packing8[i]) || {};
            rows.push([
                v(p1.recepcion), v(p1.ingreso_gasificado), v(p1.salida_gasificado), v(p1.ingreso_prefrio), v(p1.salida_prefrio),
                v(p2.peso_recepcion), v(p2.peso_ingreso_gasificado), v(p2.peso_salida_gasificado), v(p2.peso_ingreso_prefrio), v(p2.peso_salida_prefrio),
                v(p3.t_amb_recep), v(p3.t_pulp_recep), v(p3.t_amb_ing), v(p3.t_pulp_ing), v(p3.t_amb_sal), v(p3.t_pulp_sal), v(p3.t_amb_pre_in), v(p3.t_pulp_pre_in), v(p3.t_amb_pre_out), v(p3.t_pulp_pre_out),
                v(p4.recepcion), v(p4.ingreso_gasificado), v(p4.salida_gasificado), v(p4.ingreso_prefrio), v(p4.salida_prefrio),
                v(p5.recepcion), v(p5.ingreso_gasificado), v(p5.salida_gasificado), v(p5.ingreso_prefrio), v(p5.salida_prefrio),
                v(p6.recepcion), v(p6.ingreso_gasificado), v(p6.salida_gasificado), v(p6.ingreso_prefrio), v(p6.salida_prefrio),
                v(p7.recepcion), v(p7.ingreso_gasificado), v(p7.salida_gasificado), v(p7.ingreso_prefrio), v(p7.salida_prefrio),
                v(p8.observacion)
            ]);
        }
        return rows;
    }

    // Limpia el formulario packing después de subida exitosa (como el primer POST). Sin internet el fetch falla y no se limpia.
    function limpiarFormularioPacking() {
        ['packing1', 'packing2', 'packing3', 'packing4', 'packing5', 'packing6', 'packing7', 'packing8'].forEach(k => { datosPacking[k] = []; });
        renderAllPackingRows();
        var h = document.getElementById('view_hora_recepcion');
        var n = document.getElementById('view_n_viaje');
        if (h) h.value = '';
        if (n) n.value = '';
        var idsReg = ['reg_packing_recepcion','reg_packing_ingreso_gasificado','reg_packing_salida_gasificado','reg_packing_ingreso_prefrio','reg_packing_salida_prefrio','reg_packing_peso_recepcion','reg_packing_peso_ingreso_gasificado','reg_packing_peso_salida_gasificado','reg_packing_peso_ingreso_prefrio','reg_packing_peso_salida_prefrio','reg_packing_temp_amb_recepcion','reg_packing_temp_pulp_recepcion','reg_packing_temp_amb_ingreso_gas','reg_packing_temp_pulp_ingreso_gas','reg_packing_temp_amb_salida_gas','reg_packing_temp_pulp_salida_gas','reg_packing_temp_amb_ingreso_pre','reg_packing_temp_pulp_ingreso_pre','reg_packing_temp_amb_salida_pre','reg_packing_temp_pulp_salida_pre','reg_packing_humedad_recepcion','reg_packing_humedad_ingreso_gasificado','reg_packing_humedad_salida_gasificado','reg_packing_humedad_ingreso_prefrio','reg_packing_humedad_salida_prefrio','reg_packing_presion_recepcion','reg_packing_presion_ingreso_gasificado','reg_packing_presion_salida_gasificado','reg_packing_presion_ingreso_prefrio','reg_packing_presion_salida_prefrio','reg_packing_presion_fruta_recepcion','reg_packing_presion_fruta_ingreso_gasificado','reg_packing_presion_fruta_salida_gasificado','reg_packing_presion_fruta_ingreso_prefrio','reg_packing_presion_fruta_salida_prefrio','reg_packing_deficit_recepcion','reg_packing_deficit_ingreso_gasificado','reg_packing_deficit_salida_gasificado','reg_packing_deficit_ingreso_prefrio','reg_packing_deficit_salida_prefrio','reg_packing_obs_texto'];
        idsReg.forEach(function(id) { var el = document.getElementById(id); if (el) el.value = ''; });
    }

    /** Limpia toda la sección Packing: formulario + campos de vista + selects (tras envío exitoso). */
    function limpiarTodoPacking() {
        limpiarFormularioPacking();
        var viewIds = ['view_rotulo', 'view_etapa', 'view_campo', 'view_turno', 'view_placa', 'view_guia_despacho', 'view_variedad', 'view_hora_recepcion', 'view_n_viaje', 'view_fecha', 'view_ensayo_numero'];
        viewIds.forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.value = '';
        });
        var regVar = document.getElementById('reg_variedad');
        if (regVar) regVar.value = '';
        actualizarTodosContadoresPacking();
    }

    if (btnGuardarPacking) {
        btnGuardarPacking.addEventListener('click', async () => {
            if (packingBloqueadoParaActual) {
                Swal.fire({
                    title: 'Ya trabajado',
                    text: 'Este ensayo ya tiene packing en la hoja. No se puede subir más. Cambia de fecha o ensayo.',
                    icon: 'warning',
                    confirmButtonColor: '#2f7cc0'
                });
                return;
            }
            var fechaEl = document.getElementById('view_fecha');
            var ensayoEl = document.getElementById('view_ensayo_numero');
            var fecha = (fechaEl && fechaEl.value) ? fechaEl.value.trim() : (currentFechaPacking || '');
            var ensayoView = (ensayoEl && ensayoEl.value) ? String(ensayoEl.value).trim() : (currentEnsayoPacking || '');
            if (fecha && ensayoView) {
                currentFechaPacking = fecha;
                currentEnsayoPacking = ensayoView;
                guardarPackingEnStore(fecha, ensayoView);
            } else if (currentFechaPacking && currentEnsayoPacking) {
                guardarPackingEnStore(currentFechaPacking, currentEnsayoPacking);
            }
            if (!fecha) {
                Swal.fire({ title: 'Falta fecha', text: 'Elige una fecha para enviar packing.', icon: 'warning' });
                return;
            }
            var conPacking = packingYaEnviadoPorFecha[fecha] || {};
            var ensayosAEnviar = [1, 2, 3, 4].filter(function (e) {
                if (conPacking[String(e)]) return false;
                var key = keyPacking(fecha, e);
                var stored = datosPackingPorEnsayo[key];
                return stored && getPackingRowCountFromStored(stored) > 0;
            });
            if (ensayosAEnviar.length === 0) {
                Swal.fire({ title: 'Sin datos', text: 'No hay datos de packing para enviar o los ensayos ya tienen packing. Elige fecha y ensayo, agrega al menos una fila (botón +) y vuelve a Enviar.', icon: 'info' });
                return;
            }
            for (var v = 0; v < ensayosAEnviar.length; v++) {
                var keyV = keyPacking(fecha, String(ensayosAEnviar[v]));
                var stV = datosPackingPorEnsayo[keyV];
                var valid = validarConsistenciaFilasPacking(stV);
                if (!valid.ok) {
                    Swal.fire({
                        title: 'Inconsistencia de filas',
                        html: 'El <strong>Ensayo ' + ensayosAEnviar[v] + '</strong> no tiene la misma cantidad de filas en todas las secciones (Packing 1 a 8).<br><br>Las filas deben coincidir en total antes de enviar.',
                        icon: 'error',
                        confirmButtonColor: '#d33'
                    });
                    return;
                }
                var numEsperado = numFilasEsperadoPorFechaEnsayo[keyV];
                if (numEsperado == null) {
                    var cache = getPackingCache();
                    var cached = (cache.datosByFechaEnsayo && cache.datosByFechaEnsayo[keyV]) || (cache.lastRow && cache.lastRow.fecha === fecha && String(cache.lastRow.ensayo_numero) === String(ensayosAEnviar[v]) && cache.lastRow.data ? cache.lastRow.data : null);
                    if (cached && cached.numFilas != null && cached.numFilas > 0) numEsperado = cached.numFilas;
                }
                var numActual = getPackingRowCountFromStored(stV);
                if (numEsperado != null && numEsperado > 0 && numActual !== numEsperado) {
                    Swal.fire({
                        title: 'Cantidad de filas',
                        html: 'En Visual se registró con <strong>' + numEsperado + '</strong> fila(s) para esta fecha y ensayo. Debe registrarse <strong>' + numEsperado + '</strong> fila(s) en packing. Tienes <strong>' + numActual + '</strong> fila(s) para el Ensayo ' + ensayosAEnviar[v] + '.',
                        icon: 'error',
                        confirmButtonColor: '#d33'
                    });
                    return;
                }
            }
            var totalFilas = 0;
            for (var t = 0; t < ensayosAEnviar.length; t++) {
                var k = keyPacking(fecha, String(ensayosAEnviar[t]));
                var st = datosPackingPorEnsayo[k];
                if (st) totalFilas += getPackingRowCountFromStored(st);
            }
            var result = await Swal.fire({
                title: '¿Enviar packing?',
                html: 'Se enviará:<br><strong>Ensayo ' + ensayosAEnviar.join(', Ensayo ') + '</strong><br>Total: <strong>' + totalFilas + '</strong> fila(s).<br><br>¿Continuar?',
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Enviar',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#2f7cc0',
                cancelButtonColor: '#6c757d'
            });
            if (!result.isConfirmed) return;

            btnGuardarPacking.disabled = true;
            var packingText = btnGuardarPacking.querySelector('.btn-guardar-text');
            var spinnerPacking = document.getElementById('spinner_packing');
            if (packingText) packingText.textContent = 'Guardando...';
            if (spinnerPacking) spinnerPacking.style.display = 'inline-block';
            var cache = getPackingCache();
            var enviados = 0;
            try {
                for (var i = 0; i < ensayosAEnviar.length; i++) {
                    var ensayoNumero = String(ensayosAEnviar[i]);
                    var keyFeEn = keyPacking(fecha, ensayoNumero);
                    var dataCached = (cache.datosByFechaEnsayo && cache.datosByFechaEnsayo[keyFeEn]) || (cache.lastRow && cache.lastRow.fecha === fecha && String(cache.lastRow.ensayo_numero) === ensayoNumero && cache.lastRow.data ? cache.lastRow.data : null);
                    var fila = dataCached && dataCached.fila != null ? dataCached.fila : undefined;
                    var stored = datosPackingPorEnsayo[keyFeEn];
                    var packingRows = buildPackingRowsFromStored(stored);
                    if (packingRows.length === 0) continue;
                    var horaRecepcion = (stored.hora_recepcion != null && stored.hora_recepcion !== '') ? String(stored.hora_recepcion).trim() : '';
                    var nViaje = (stored.n_viaje != null && stored.n_viaje !== '') ? String(stored.n_viaje).trim() : '';
                    await postPacking({ fecha: fecha, ensayo_numero: ensayoNumero, fila: fila, hora_recepcion: horaRecepcion, n_viaje: nViaje, packingRows: packingRows });
                    enviados++;
                    delete datosPackingPorEnsayo[keyFeEn];
                    var idx = datosPackingPorEnsayoKeysOrder.indexOf(keyFeEn);
                    if (idx !== -1) datosPackingPorEnsayoKeysOrder.splice(idx, 1);
                }
                if (enviados > 0) {
                    limpiarTodoPacking();
                    for (var b = 1; b <= 8; b++) {
                        var bodyId = 'body-packing-' + b;
                        var bodyEl = document.getElementById(bodyId);
                        var headerEl = document.querySelector('[data-target="' + bodyId + '"]');
                        var chevronEl = headerEl ? headerEl.querySelector('.chevron') : null;
                        if (bodyEl) bodyEl.style.display = 'none';
                        if (chevronEl) chevronEl.classList.remove('rotate');
                    }
                    await Swal.fire({
                        title: 'Packing enviado',
                        html: 'Se enviaron <strong>' + enviados + '</strong> ensayo(s): Ensayo ' + ensayosAEnviar.join(', Ensayo ') + '.<br><br>Se limpió el formulario y se cerraron los bloques.',
                        icon: 'success',
                        confirmButtonColor: '#2f7cc0'
                    });
                }
            } catch (e) {
                Swal.fire({ title: 'Error', text: (e && e.message) || 'No se pudo enviar el packing.', icon: 'error', confirmButtonColor: '#d33' });
            } finally {
                btnGuardarPacking.disabled = false;
                if (packingText) packingText.textContent = 'ENVIAR PACKING';
                if (spinnerPacking) spinnerPacking.style.display = 'none';
            }
        });
    }

    // Eliminar solo en ESA sección. Cada wrapper es independiente. Siempre pide confirmación con SweetAlert.
    function eliminarFilaPacking(sectionKey, index) {
        Swal.fire({
            title: '¿Eliminar fila?',
            text: '¿Estás seguro de que deseas eliminar esta fila?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#d33',
            cancelButtonColor: '#6c757d'
        }).then(function (result) {
            if (!result.isConfirmed) return;
            const arr = sectionKey && datosPacking[sectionKey];
            if (!arr || !Array.isArray(arr) || index < 0 || index >= arr.length) return;
            arr.splice(index, 1);
        renderAllPackingRows();
            actualizarTodosContadoresPacking();
        });
    }

    // Replicar solo en ESA sección. Referencia = wrapper_packing_2 (Pesos): no se puede tener más filas que las de Packing 2. Packing 2 no tiene botón Replica (es el padre).
    const SECTION_KEYS_REPLICA = ['packing1', 'packing3', 'packing4', 'packing5', 'packing6', 'packing7', 'packing8'];
    function replicarHastaPacking2(sectionKey, rowIndex) {
        const ref = (datosPacking.packing2 && datosPacking.packing2.length) || 0;
        if (ref === 0) {
            Swal.fire({
                title: 'Atención',
                text: 'No hay filas en Pesos (Packing 2). Agrega al menos una fila en Pesos para poder replicar.',
                icon: 'warning',
                confirmButtonColor: '#2f7cc0'
            });
            return;
        }
        const arr = sectionKey && datosPacking[sectionKey];
        if (!arr || !Array.isArray(arr)) return;
        if (arr.length >= ref) {
            Swal.fire({
                title: 'Límite alcanzado',
                text: 'Ya tienes ' + ref + ' fila(s), que es la cantidad según Pesos (Packing 2). No se puede replicar más en esta sección.',
                icon: 'info',
                confirmButtonColor: '#2f7cc0'
            });
            return;
        }
        var fuente = (rowIndex >= 0 && arr[rowIndex] != null) ? arr[rowIndex] : (arr.length > 0 ? arr[arr.length - 1] : (emptiesPacking[sectionKey] || {}));
        arr.push(typeof fuente === 'object' && fuente !== null ? { ...fuente } : {});
        renderAllPackingRows();
        actualizarTodosContadoresPacking();
    }

    function agregarFilaPacking1(data, tbody, num) {
        const row = document.createElement('tr');
        row.setAttribute('data-packing-index', num - 1);
        row.innerHTML = `<td class="b-left">${num}</td><td>${data.recepcion || '-'}</td><td>${data.ingreso_gasificado || '-'}</td><td>${data.salida_gasificado || '-'}</td><td>${data.ingreso_prefrio || '-'}</td><td>${data.salida_prefrio || '-'}</td><td class="b-right"><button type="button" class="btn-edit-row" title="Editar"><i data-lucide="pencil"></i></button><button type="button" class="btn-delete-row" title="Eliminar"><i data-lucide="trash-2"></i></button><button type="button" class="btn-replicate-row" title="Replicar"><i data-lucide="copy"></i></button></td>`;
        tbody.appendChild(row);
        if (window.lucide) lucide.createIcons();
        row.querySelector('.btn-edit-row').addEventListener('click', () => editarFilaPacking1(num - 1, data));
        row.querySelector('.btn-delete-row').addEventListener('click', () => eliminarFilaPacking('packing1', num - 1));
        row.querySelector('.btn-replicate-row').addEventListener('click', () => { replicarHastaPacking2('packing1', num - 1); });
    }

    function agregarFilaPacking2(data, tbody, num) {
        const row = document.createElement('tr');
        row.setAttribute('data-packing-index', num - 1);
        row.innerHTML = `<td class="b-left">${num}</td><td>${data.peso_recepcion ?? '-'}</td><td>${data.peso_ingreso_gasificado ?? '-'}</td><td>${data.peso_salida_gasificado ?? '-'}</td><td>${data.peso_ingreso_prefrio ?? '-'}</td><td>${data.peso_salida_prefrio ?? '-'}</td><td class="b-right"><button type="button" class="btn-edit-row" title="Editar"><i data-lucide="pencil"></i></button><button type="button" class="btn-delete-row" title="Eliminar"><i data-lucide="trash-2"></i></button></td>`;
        tbody.appendChild(row);
        if (window.lucide) lucide.createIcons();
        row.querySelector('.btn-edit-row').addEventListener('click', () => editarFilaPacking2(num - 1, data));
        row.querySelector('.btn-delete-row').addEventListener('click', () => eliminarFilaPacking('packing2', num - 1));
    }

    function agregarFilaPacking3(data, tbody, num) {
        const row = document.createElement('tr');
        row.setAttribute('data-packing-index', num - 1);
        row.innerHTML = `<td class="b-left">${num}</td><td>${data.t_amb_recep ?? '-'}</td><td>${data.t_pulp_recep ?? '-'}</td><td>${data.t_amb_ing ?? '-'}</td><td>${data.t_pulp_ing ?? '-'}</td><td>${data.t_amb_sal ?? '-'}</td><td>${data.t_pulp_sal ?? '-'}</td><td>${data.t_amb_pre_in ?? '-'}</td><td>${data.t_pulp_pre_in ?? '-'}</td><td>${data.t_amb_pre_out ?? '-'}</td><td>${data.t_pulp_pre_out ?? '-'}</td><td class="b-right"><button type="button" class="btn-edit-row" title="Editar"><i data-lucide="pencil"></i></button><button type="button" class="btn-delete-row" title="Eliminar"><i data-lucide="trash-2"></i></button><button type="button" class="btn-replicate-row" title="Replicar"><i data-lucide="copy"></i></button></td>`;
        tbody.appendChild(row);
        if (window.lucide) lucide.createIcons();
        row.querySelector('.btn-edit-row').addEventListener('click', () => editarFilaPacking3(num - 1, data));
        row.querySelector('.btn-delete-row').addEventListener('click', () => eliminarFilaPacking('packing3', num - 1));
        row.querySelector('.btn-replicate-row').addEventListener('click', () => { replicarHastaPacking2('packing3', num - 1); });
    }

    function agregarFilaPacking4(data, tbody, num) {
        const row = document.createElement('tr');
        row.setAttribute('data-packing-index', num - 1);
        row.innerHTML = `<td class="b-left">${num}</td><td>${data.recepcion ?? '-'}</td><td>${data.ingreso_gasificado ?? '-'}</td><td>${data.salida_gasificado ?? '-'}</td><td>${data.ingreso_prefrio ?? '-'}</td><td>${data.salida_prefrio ?? '-'}</td><td class="b-right"><button type="button" class="btn-edit-row" title="Editar"><i data-lucide="pencil"></i></button><button type="button" class="btn-delete-row" title="Eliminar"><i data-lucide="trash-2"></i></button><button type="button" class="btn-replicate-row" title="Replicar"><i data-lucide="copy"></i></button></td>`;
        tbody.appendChild(row);
        if (window.lucide) lucide.createIcons();
        row.querySelector('.btn-edit-row').addEventListener('click', () => editarFilaPacking4(num - 1, data));
        row.querySelector('.btn-delete-row').addEventListener('click', () => eliminarFilaPacking('packing4', num - 1));
        row.querySelector('.btn-replicate-row').addEventListener('click', () => { replicarHastaPacking2('packing4', num - 1); });
    }

    function agregarFilaPacking5(data, tbody, num) {
        const row = document.createElement('tr');
        row.setAttribute('data-packing-index', num - 1);
        row.innerHTML = `<td class="b-left">${num}</td><td>${data.recepcion ?? '-'}</td><td>${data.ingreso_gasificado ?? '-'}</td><td>${data.salida_gasificado ?? '-'}</td><td>${data.ingreso_prefrio ?? '-'}</td><td>${data.salida_prefrio ?? '-'}</td><td class="b-right"><button type="button" class="btn-edit-row" title="Editar"><i data-lucide="pencil"></i></button><button type="button" class="btn-delete-row" title="Eliminar"><i data-lucide="trash-2"></i></button><button type="button" class="btn-replicate-row" title="Replicar"><i data-lucide="copy"></i></button></td>`;
        tbody.appendChild(row);
        if (window.lucide) lucide.createIcons();
        row.querySelector('.btn-edit-row').addEventListener('click', () => editarFilaPacking5(num - 1, data));
        row.querySelector('.btn-delete-row').addEventListener('click', () => eliminarFilaPacking('packing5', num - 1));
        row.querySelector('.btn-replicate-row').addEventListener('click', () => { replicarHastaPacking2('packing5', num - 1); });
    }

    function agregarFilaPacking6(data, tbody, num) {
        const row = document.createElement('tr');
        row.setAttribute('data-packing-index', num - 1);
        row.innerHTML = `<td class="b-left">${num}</td><td>${data.recepcion ?? '-'}</td><td>${data.ingreso_gasificado ?? '-'}</td><td>${data.salida_gasificado ?? '-'}</td><td>${data.ingreso_prefrio ?? '-'}</td><td>${data.salida_prefrio ?? '-'}</td><td class="b-right"><button type="button" class="btn-edit-row" title="Editar"><i data-lucide="pencil"></i></button><button type="button" class="btn-delete-row" title="Eliminar"><i data-lucide="trash-2"></i></button><button type="button" class="btn-replicate-row" title="Replicar"><i data-lucide="copy"></i></button></td>`;
        tbody.appendChild(row);
        if (window.lucide) lucide.createIcons();
        row.querySelector('.btn-edit-row').addEventListener('click', () => editarFilaPacking6(num - 1, data));
        row.querySelector('.btn-delete-row').addEventListener('click', () => eliminarFilaPacking('packing6', num - 1));
        row.querySelector('.btn-replicate-row').addEventListener('click', () => { replicarHastaPacking2('packing6', num - 1); });
    }

    function agregarFilaPacking7(data, tbody, num) {
        const row = document.createElement('tr');
        row.setAttribute('data-packing-index', num - 1);
        row.innerHTML = `<td class="b-left">${num}</td><td>${data.recepcion ?? '-'}</td><td>${data.ingreso_gasificado ?? '-'}</td><td>${data.salida_gasificado ?? '-'}</td><td>${data.ingreso_prefrio ?? '-'}</td><td>${data.salida_prefrio ?? '-'}</td><td class="b-right"><button type="button" class="btn-edit-row" title="Editar"><i data-lucide="pencil"></i></button><button type="button" class="btn-delete-row" title="Eliminar"><i data-lucide="trash-2"></i></button><button type="button" class="btn-replicate-row" title="Replicar"><i data-lucide="copy"></i></button></td>`;
        tbody.appendChild(row);
        if (window.lucide) lucide.createIcons();
        row.querySelector('.btn-edit-row').addEventListener('click', () => editarFilaPacking7(num - 1, data));
        row.querySelector('.btn-delete-row').addEventListener('click', () => eliminarFilaPacking('packing7', num - 1));
        row.querySelector('.btn-replicate-row').addEventListener('click', () => { replicarHastaPacking2('packing7', num - 1); });
    }

    function agregarFilaPacking8(data, tbody, num) {
        const row = document.createElement('tr');
        row.setAttribute('data-packing-index', num - 1);
        row.innerHTML = `<td class="b-left">${num}</td><td>${(data.observacion || '').trim() || '-'}</td><td class="b-right"><button type="button" class="btn-edit-row" title="Editar"><i data-lucide="pencil"></i></button><button type="button" class="btn-delete-row" title="Eliminar"><i data-lucide="trash-2"></i></button><button type="button" class="btn-replicate-row" title="Replicar"><i data-lucide="copy"></i></button></td>`;
        tbody.appendChild(row);
        if (window.lucide) lucide.createIcons();
        row.querySelector('.btn-edit-row').addEventListener('click', () => editarFilaPacking8(num - 1, data));
        row.querySelector('.btn-delete-row').addEventListener('click', () => eliminarFilaPacking('packing8', num - 1));
        row.querySelector('.btn-replicate-row').addEventListener('click', () => { replicarHastaPacking2('packing8', num - 1); });
    }

    function renderAllPackingRows() {
        const t1 = document.getElementById('tbody-packing-1');
        const t2 = document.getElementById('tbody-packing-pesos');
        const t3 = document.getElementById('tbody-packing-temp');
        const t4 = document.getElementById('tbody-packing-humedad');
        const t5 = document.getElementById('tbody-packing-presion');
        const t6 = document.getElementById('tbody-packing-presion-fruta');
        const t7 = document.getElementById('tbody-packing-deficit');
        const t8 = document.getElementById('tbody-packing-obs');
        if (t1) { t1.innerHTML = ''; datosPacking.packing1.forEach((d, i) => agregarFilaPacking1(d, t1, i + 1)); }
        if (t2) { t2.innerHTML = ''; datosPacking.packing2.forEach((d, i) => agregarFilaPacking2(d, t2, i + 1)); }
        if (t3) { t3.innerHTML = ''; datosPacking.packing3.forEach((d, i) => agregarFilaPacking3(d, t3, i + 1)); }
        if (t4) { t4.innerHTML = ''; datosPacking.packing4.forEach((d, i) => agregarFilaPacking4(d, t4, i + 1)); }
        if (t5) { t5.innerHTML = ''; datosPacking.packing5.forEach((d, i) => agregarFilaPacking5(d, t5, i + 1)); }
        if (t6) { t6.innerHTML = ''; datosPacking.packing6.forEach((d, i) => agregarFilaPacking6(d, t6, i + 1)); }
        if (t7) { t7.innerHTML = ''; datosPacking.packing7.forEach((d, i) => agregarFilaPacking7(d, t7, i + 1)); }
        if (t8) { t8.innerHTML = ''; datosPacking.packing8.forEach((d, i) => agregarFilaPacking8(d, t8, i + 1)); }
        actualizarTodosContadoresPacking();
    }

    const modalGrid = (labels, inputsHtml) => `<div class="packing-modal-grid">${labels.map((l, i) => `<div class="packing-modal-field"><label>${l}</label>${inputsHtml[i]}</div>`).join('')}</div>`;

    /** Validación Packing 1: recepcion < ingreso_gas < salida_gas < ingreso_prefrio < salida_prefrio (tiempos). */
    function validarPacking1Tiempos(data) {
        const r = (data.recepcion || '').trim();
        const ig = (data.ingreso_gasificado || '').trim();
        const sg = (data.salida_gasificado || '').trim();
        const ip = (data.ingreso_prefrio || '').trim();
        const sp = (data.salida_prefrio || '').trim();
        if (!r || !ig || !sg || !ip || !sp) return { ok: false, msg: 'Todos los tiempos deben estar llenos.' };
        if (ig <= r) return { ok: false, msg: 'Ingreso Gasificado debe ser mayor que Recepción.' };
        if (sg <= ig) return { ok: false, msg: 'Salida Gasificado debe ser mayor que Ingreso Gasificado.' };
        if (ip <= sg) return { ok: false, msg: 'Ingreso Prefrío debe ser mayor que Salida Gasificado.' };
        if (sp <= ip) return { ok: false, msg: 'Salida Prefrío debe ser mayor que Ingreso Prefrío.' };
        return { ok: true };
    }

    /** Validación Packing 2: peso_recepcion > peso_ingreso_gas >= peso_salida_gas >= peso_ingreso_pre >= peso_salida_pre. */
    function validarPacking2Pesos(data) {
        const pr = parseFloat(String(data.peso_recepcion || '').replace(',', '.'));
        const pig = parseFloat(String(data.peso_ingreso_gasificado || '').replace(',', '.'));
        const psg = parseFloat(String(data.peso_salida_gasificado || '').replace(',', '.'));
        const pip = parseFloat(String(data.peso_ingreso_prefrio || '').replace(',', '.'));
        const psp = parseFloat(String(data.peso_salida_prefrio || '').replace(',', '.'));
        if (isNaN(pr) || isNaN(pig) || isNaN(psg) || isNaN(pip) || isNaN(psp)) return { ok: false, msg: 'Todos los pesos deben ser números.' };
        if (pig > pr) return { ok: false, msg: 'Peso Ingreso Gasificado no debe ser mayor que Peso Recepción (debe ser menor o igual).' };
        if (psg > pig) return { ok: false, msg: 'Peso Salida Gasificado debe ser menor o igual que Peso Ingreso Gasificado.' };
        if (pip > psg) return { ok: false, msg: 'Peso Ingreso Prefrío debe ser menor o igual que Peso Salida Gasificado.' };
        if (psp > pip) return { ok: false, msg: 'Peso Salida Prefrío debe ser menor o igual que Peso Ingreso Prefrío.' };
        return { ok: true };
    }

    /** Validación numérica: valor >= 0, no letras. Para listas de valores (ej. [recep, ing, sal, pre_in, pre_out]). */
    function validarPackingNumericoRequerido(valores) {
        for (let i = 0; i < valores.length; i++) {
            const v = String(valores[i] ?? '').trim();
            if (v === '') return { ok: false, msg: 'Todos los campos deben estar llenos.' };
            const n = parseFloat(v.replace(',', '.'));
            if (isNaN(n) || n < 0) return { ok: false, msg: 'Solo números mayores o iguales a 0. No letras ni negativos.' };
        }
        return { ok: true };
    }

    /** Validación numérica opcional: si hay valor, debe ser >= 0. */
    function validarPackingNumericoOpcional(valores) {
        for (let i = 0; i < valores.length; i++) {
            const v = String(valores[i] ?? '').trim();
            if (v === '') continue;
            const n = parseFloat(v.replace(',', '.'));
            if (isNaN(n) || n < 0) return { ok: false, msg: 'Los valores deben ser números mayores o iguales a 0. No letras ni negativos.' };
        }
        return { ok: true };
    }

    function editarFilaPacking1(index, dataActual) {
        const labels = ['Recep.', 'In Gas.', 'Out Gas.', 'In Pre.', 'Out Pre.'];
        const ids = ['e_recep','e_ing','e_sal','e_pre_in','e_pre_out'];
        const vals = [dataActual.recepcion, dataActual.ingreso_gasificado, dataActual.salida_gasificado, dataActual.ingreso_prefrio, dataActual.salida_prefrio];
        const inputs = ids.map((id, i) => `<input type="time" id="${id}" class="swal2-input" value="${vals[i] || ''}">`);
        var numFila = index + 1;
        Swal.fire({
            title: 'Editar Tiempos — Fila #' + numFila,
            customClass: { popup: 'packing-edit-modal' },
            html: modalGrid(labels, inputs),
            showCancelButton: true,
            confirmButtonText: 'Guardar',
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const val = { recepcion: document.getElementById('e_recep').value, ingreso_gasificado: document.getElementById('e_ing').value, salida_gasificado: document.getElementById('e_sal').value, ingreso_prefrio: document.getElementById('e_pre_in').value, salida_prefrio: document.getElementById('e_pre_out').value };
                const res = validarPacking1Tiempos(val);
                if (!res.ok) { Swal.showValidationMessage(res.msg); return false; }
                return val;
            }
        }).then(r => { if (r.isConfirmed && r.value) { datosPacking.packing1[index] = r.value; renderAllPackingRows(); } });
    }
    function editarFilaPacking2(index, dataActual) {
        const labels = ['Recep. (gr)', 'In Gas. (gr)', 'Out Gas. (gr)', 'In Pre. (gr)', 'Out Pre. (gr)'];
        const ids = ['e_p1','e_p2','e_p3','e_p4','e_p5'];
        const vals = [dataActual.peso_recepcion, dataActual.peso_ingreso_gasificado, dataActual.peso_salida_gasificado, dataActual.peso_ingreso_prefrio, dataActual.peso_salida_prefrio];
        const inputs = ids.map((id, i) => `<input type="number" step="0.1" min="0" id="${id}" class="swal2-input" value="${vals[i] ?? ''}">`);
        var numFila = index + 1;
        Swal.fire({
            title: 'Editar Pesos — Fila #' + numFila,
            customClass: { popup: 'packing-edit-modal' },
            html: modalGrid(labels, inputs),
            showCancelButton: true,
            confirmButtonText: 'Guardar',
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const val = { peso_recepcion: document.getElementById('e_p1').value, peso_ingreso_gasificado: document.getElementById('e_p2').value, peso_salida_gasificado: document.getElementById('e_p3').value, peso_ingreso_prefrio: document.getElementById('e_p4').value, peso_salida_prefrio: document.getElementById('e_p5').value };
                const res = validarPacking2Pesos(val);
                if (!res.ok) { Swal.showValidationMessage(res.msg); return false; }
                return val;
            }
        }).then(r => { if (r.isConfirmed && r.value) { datosPacking.packing2[index] = r.value; renderAllPackingRows(); } });
    }
    function editarFilaPacking3(index, dataActual) {
        const labels = ['T.amb Recep','T.pulp Recep','T.amb In Gas','T.pulp In Gas','T.amb Out Gas','T.pulp Out Gas','T.amb In Pre','T.pulp In Pre','T.amb Out Pre','T.pulp Out Pre'];
        const ids = ['e_t1','e_t2','e_t3','e_t4','e_t5','e_t6','e_t7','e_t8','e_t9','e_t10'];
        const vals = [dataActual.t_amb_recep, dataActual.t_pulp_recep, dataActual.t_amb_ing, dataActual.t_pulp_ing, dataActual.t_amb_sal, dataActual.t_pulp_sal, dataActual.t_amb_pre_in, dataActual.t_pulp_pre_in, dataActual.t_amb_pre_out, dataActual.t_pulp_pre_out];
        const inputs = ids.map((id, i) => `<input type="number" step="0.1" min="0" id="${id}" class="swal2-input" value="${vals[i] ?? ''}">`);
        var numFila = index + 1;
        Swal.fire({
            title: 'Editar Temperaturas (°C) — Fila #' + numFila,
            customClass: { popup: 'packing-edit-modal' },
            html: modalGrid(labels, inputs),
            showCancelButton: true,
            confirmButtonText: 'Guardar',
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const v = [document.getElementById('e_t1').value, document.getElementById('e_t2').value, document.getElementById('e_t3').value, document.getElementById('e_t4').value, document.getElementById('e_t5').value, document.getElementById('e_t6').value, document.getElementById('e_t7').value, document.getElementById('e_t8').value, document.getElementById('e_t9').value, document.getElementById('e_t10').value];
                const res = validarPackingNumericoRequerido(v);
                if (!res.ok) { Swal.showValidationMessage(res.msg); return false; }
                return { t_amb_recep: v[0], t_pulp_recep: v[1], t_amb_ing: v[2], t_pulp_ing: v[3], t_amb_sal: v[4], t_pulp_sal: v[5], t_amb_pre_in: v[6], t_pulp_pre_in: v[7], t_amb_pre_out: v[8], t_pulp_pre_out: v[9] };
            }
        }).then(r => { if (r.isConfirmed && r.value) { datosPacking.packing3[index] = r.value; renderAllPackingRows(); } });
    }
    function editarFilaPacking4(index, dataActual) {
        const labels = ['Recep.','In Gas.','Out Gas.','In Pre.','Out Pre.'];
        const v = [dataActual.recepcion, dataActual.ingreso_gasificado, dataActual.salida_gasificado, dataActual.ingreso_prefrio, dataActual.salida_prefrio];
        const inputs = [0,1,2,3,4].map(i => `<input type="number" step="0.1" min="0" id="e_h${i}" class="swal2-input" value="${v[i] ?? ''}">`);
        var numFila = index + 1;
        Swal.fire({
            title: 'Editar Humedad — Fila #' + numFila,
            customClass: { popup: 'packing-edit-modal' },
            html: modalGrid(labels, inputs),
            showCancelButton: true,
            confirmButtonText: 'Guardar',
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const val = [document.getElementById('e_h0').value, document.getElementById('e_h1').value, document.getElementById('e_h2').value, document.getElementById('e_h3').value, document.getElementById('e_h4').value];
                const res = validarPackingNumericoRequerido(val);
                if (!res.ok) { Swal.showValidationMessage(res.msg); return false; }
                return { recepcion: val[0], ingreso_gasificado: val[1], salida_gasificado: val[2], ingreso_prefrio: val[3], salida_prefrio: val[4] };
            }
        }).then(r => { if (r.isConfirmed && r.value) { datosPacking.packing4[index] = r.value; renderAllPackingRows(); } });
    }
    function editarFilaPacking5(index, dataActual) {
        const labels = ['Recep.','In Gas.','Out Gas.','In Pre.','Out Pre.'];
        const v = [dataActual.recepcion, dataActual.ingreso_gasificado, dataActual.salida_gasificado, dataActual.ingreso_prefrio, dataActual.salida_prefrio];
        const inputs = [0,1,2,3,4].map(i => `<input type="number" step="0.001" min="0" id="e_pr${i}" class="swal2-input" value="${v[i] ?? ''}">`);
        var numFila = index + 1;
        Swal.fire({
            title: 'Editar Presión ambiente — Fila #' + numFila,
            customClass: { popup: 'packing-edit-modal' },
            html: modalGrid(labels, inputs),
            showCancelButton: true,
            confirmButtonText: 'Guardar',
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const val = [document.getElementById('e_pr0').value, document.getElementById('e_pr1').value, document.getElementById('e_pr2').value, document.getElementById('e_pr3').value, document.getElementById('e_pr4').value];
                const res = validarPackingNumericoRequerido(val);
                if (!res.ok) { Swal.showValidationMessage(res.msg); return false; }
                return { recepcion: val[0], ingreso_gasificado: val[1], salida_gasificado: val[2], ingreso_prefrio: val[3], salida_prefrio: val[4] };
            }
        }).then(r => { if (r.isConfirmed && r.value) { datosPacking.packing5[index] = r.value; renderAllPackingRows(); } });
    }
    function editarFilaPacking6(index, dataActual) {
        const labels = ['Recep.','In Gas.','Out Gas.','In Pre.','Out Pre.'];
        const v = [dataActual.recepcion, dataActual.ingreso_gasificado, dataActual.salida_gasificado, dataActual.ingreso_prefrio, dataActual.salida_prefrio];
        const inputs = [0,1,2,3,4].map(i => `<input type="number" step="0.001" min="0" id="e_pf${i}" class="swal2-input" value="${v[i] ?? ''}">`);
        var numFila = index + 1;
        Swal.fire({
            title: 'Editar Presión fruta — Fila #' + numFila,
            customClass: { popup: 'packing-edit-modal' },
            html: modalGrid(labels, inputs),
            showCancelButton: true,
            confirmButtonText: 'Guardar',
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const val = [document.getElementById('e_pf0').value, document.getElementById('e_pf1').value, document.getElementById('e_pf2').value, document.getElementById('e_pf3').value, document.getElementById('e_pf4').value];
                const res = validarPackingNumericoRequerido(val);
                if (!res.ok) { Swal.showValidationMessage(res.msg); return false; }
                return { recepcion: val[0], ingreso_gasificado: val[1], salida_gasificado: val[2], ingreso_prefrio: val[3], salida_prefrio: val[4] };
            }
        }).then(r => { if (r.isConfirmed && r.value) { datosPacking.packing6[index] = r.value; renderAllPackingRows(); } });
    }
    function editarFilaPacking7(index, dataActual) {
        const labels = ['Recep.','In Gas.','Out Gas.','In Pre.','Out Pre.'];
        const v = [dataActual.recepcion, dataActual.ingreso_gasificado, dataActual.salida_gasificado, dataActual.ingreso_prefrio, dataActual.salida_prefrio];
        const inputs = [0,1,2,3,4].map(i => `<input type="number" step="0.001" min="0" id="e_d${i}" class="swal2-input" value="${v[i] ?? ''}">`);
        var numFila = index + 1;
        Swal.fire({
            title: 'Editar Déficit (Kpa) — Fila #' + numFila,
            customClass: { popup: 'packing-edit-modal' },
            html: modalGrid(labels, inputs),
            showCancelButton: true,
            confirmButtonText: 'Guardar',
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const val = [document.getElementById('e_d0').value, document.getElementById('e_d1').value, document.getElementById('e_d2').value, document.getElementById('e_d3').value, document.getElementById('e_d4').value];
                const res = validarPackingNumericoOpcional(val);
                if (!res.ok) { Swal.showValidationMessage(res.msg); return false; }
                return { recepcion: val[0], ingreso_gasificado: val[1], salida_gasificado: val[2], ingreso_prefrio: val[3], salida_prefrio: val[4] };
            }
        }).then(r => { if (r.isConfirmed && r.value) { datosPacking.packing7[index] = r.value; renderAllPackingRows(); } });
    }
    function editarFilaPacking8(index, dataActual) {
        var numFila = index + 1;
        Swal.fire({ title: 'Editar Observación — Fila #' + numFila, customClass: { popup: 'packing-edit-modal' }, input: 'text', inputValue: (dataActual.observacion || '').toString(), showCancelButton: true, confirmButtonText: 'Guardar', cancelButtonText: 'Cancelar' }).then(r => { if (r.isConfirmed && r.value !== undefined) { datosPacking.packing8[index] = { observacion: r.value }; renderAllPackingRows(); } });
    }

    // Agregar fila solo en esa sección; Replicar (en Pesos u otras) iguala todo a packing2 y copia última fila.
    const btnAddPacking1 = document.getElementById('btn-add-packing');
    if (btnAddPacking1) btnAddPacking1.addEventListener('click', () => {
        const recepcion = (document.getElementById('reg_packing_recepcion') && document.getElementById('reg_packing_recepcion').value) || '';
        const ingreso_gasificado = (document.getElementById('reg_packing_ingreso_gasificado') && document.getElementById('reg_packing_ingreso_gasificado').value) || '';
        const salida_gasificado = (document.getElementById('reg_packing_salida_gasificado') && document.getElementById('reg_packing_salida_gasificado').value) || '';
        const ingreso_prefrio = (document.getElementById('reg_packing_ingreso_prefrio') && document.getElementById('reg_packing_ingreso_prefrio').value) || '';
        const salida_prefrio = (document.getElementById('reg_packing_salida_prefrio') && document.getElementById('reg_packing_salida_prefrio').value) || '';
        const data = { recepcion, ingreso_gasificado, salida_gasificado, ingreso_prefrio, salida_prefrio };
        const res1 = validarPacking1Tiempos(data);
        if (!res1.ok) { Swal.fire({ title: 'Validación', text: res1.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        datosPacking.packing1.push(data);
        const tbody = document.getElementById('tbody-packing-1');
        if (tbody) agregarFilaPacking1(data, tbody, datosPacking.packing1.length);
        actualizarContadorPacking('next_clam_packing', datosPacking.packing1.length);
        if (document.getElementById('reg_packing_recepcion')) document.getElementById('reg_packing_recepcion').value = '';
        if (document.getElementById('reg_packing_ingreso_gasificado')) document.getElementById('reg_packing_ingreso_gasificado').value = '';
        if (document.getElementById('reg_packing_salida_gasificado')) document.getElementById('reg_packing_salida_gasificado').value = '';
        if (document.getElementById('reg_packing_ingreso_prefrio')) document.getElementById('reg_packing_ingreso_prefrio').value = '';
        if (document.getElementById('reg_packing_salida_prefrio')) document.getElementById('reg_packing_salida_prefrio').value = '';
    });

    const btnAddPacking2 = document.getElementById('btn-add-pesos');
    if (btnAddPacking2) btnAddPacking2.addEventListener('click', () => {
        const peso_recepcion = (document.getElementById('reg_packing_peso_recepcion') && document.getElementById('reg_packing_peso_recepcion').value) || '';
        const peso_ingreso_gasificado = (document.getElementById('reg_packing_peso_ingreso_gasificado') && document.getElementById('reg_packing_peso_ingreso_gasificado').value) || '';
        const peso_salida_gasificado = (document.getElementById('reg_packing_peso_salida_gasificado') && document.getElementById('reg_packing_peso_salida_gasificado').value) || '';
        const peso_ingreso_prefrio = (document.getElementById('reg_packing_peso_ingreso_prefrio') && document.getElementById('reg_packing_peso_ingreso_prefrio').value) || '';
        const peso_salida_prefrio = (document.getElementById('reg_packing_peso_salida_prefrio') && document.getElementById('reg_packing_peso_salida_prefrio').value) || '';
        const data = { peso_recepcion, peso_ingreso_gasificado, peso_salida_gasificado, peso_ingreso_prefrio, peso_salida_prefrio };
        const res2 = validarPacking2Pesos(data);
        if (!res2.ok) { Swal.fire({ title: 'Validación', text: res2.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        datosPacking.packing2.push(data);
        const tbody = document.getElementById('tbody-packing-pesos');
        if (tbody) agregarFilaPacking2(data, tbody, datosPacking.packing2.length);
        actualizarContadorPacking('next_clam_pesos', datosPacking.packing2.length);
        ['reg_packing_peso_recepcion','reg_packing_peso_ingreso_gasificado','reg_packing_peso_salida_gasificado','reg_packing_peso_ingreso_prefrio','reg_packing_peso_salida_prefrio'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    });

    const btnAddPacking3 = document.getElementById('btn-add-temp');
    if (btnAddPacking3) btnAddPacking3.addEventListener('click', () => {
        const get = id => (document.getElementById(id) && document.getElementById(id).value) || '';
        const vals = [get('reg_packing_temp_amb_recepcion'), get('reg_packing_temp_pulp_recepcion'), get('reg_packing_temp_amb_ingreso_gas'), get('reg_packing_temp_pulp_ingreso_gas'), get('reg_packing_temp_amb_salida_gas'), get('reg_packing_temp_pulp_salida_gas'), get('reg_packing_temp_amb_ingreso_pre'), get('reg_packing_temp_pulp_ingreso_pre'), get('reg_packing_temp_amb_salida_pre'), get('reg_packing_temp_pulp_salida_pre')];
        const res3 = validarPackingNumericoRequerido(vals);
        if (!res3.ok) { Swal.fire({ title: 'Validación', text: res3.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        const data = { t_amb_recep: vals[0], t_pulp_recep: vals[1], t_amb_ing: vals[2], t_pulp_ing: vals[3], t_amb_sal: vals[4], t_pulp_sal: vals[5], t_amb_pre_in: vals[6], t_pulp_pre_in: vals[7], t_amb_pre_out: vals[8], t_pulp_pre_out: vals[9] };
        datosPacking.packing3.push(data);
        const tbody = document.getElementById('tbody-packing-temp');
        if (tbody) agregarFilaPacking3(data, tbody, datosPacking.packing3.length);
        actualizarContadorPacking('next_clam_packing_temp', datosPacking.packing3.length);
        ['reg_packing_temp_amb_recepcion','reg_packing_temp_pulp_recepcion','reg_packing_temp_amb_ingreso_gas','reg_packing_temp_pulp_ingreso_gas','reg_packing_temp_amb_salida_gas','reg_packing_temp_pulp_salida_gas','reg_packing_temp_amb_ingreso_pre','reg_packing_temp_pulp_ingreso_pre','reg_packing_temp_amb_salida_pre','reg_packing_temp_pulp_salida_pre'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    });

    const btnAddPacking4 = document.getElementById('btn-add-packing-humedad');
    if (btnAddPacking4) btnAddPacking4.addEventListener('click', () => {
        const get = id => (document.getElementById(id) && document.getElementById(id).value) || '';
        const vals = [get('reg_packing_humedad_recepcion'), get('reg_packing_humedad_ingreso_gasificado'), get('reg_packing_humedad_salida_gasificado'), get('reg_packing_humedad_ingreso_prefrio'), get('reg_packing_humedad_salida_prefrio')];
        const res4 = validarPackingNumericoRequerido(vals);
        if (!res4.ok) { Swal.fire({ title: 'Validación', text: res4.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        const data = { recepcion: vals[0], ingreso_gasificado: vals[1], salida_gasificado: vals[2], ingreso_prefrio: vals[3], salida_prefrio: vals[4] };
        datosPacking.packing4.push(data);
        const tbody = document.getElementById('tbody-packing-humedad');
        if (tbody) agregarFilaPacking4(data, tbody, datosPacking.packing4.length);
        actualizarContadorPacking('next_clam_packing_humedad', datosPacking.packing4.length);
        ['reg_packing_humedad_recepcion','reg_packing_humedad_ingreso_gasificado','reg_packing_humedad_salida_gasificado','reg_packing_humedad_ingreso_prefrio','reg_packing_humedad_salida_prefrio'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    });

    const btnAddPacking5 = document.getElementById('btn-add-packing-presion');
    if (btnAddPacking5) btnAddPacking5.addEventListener('click', () => {
        const get = id => (document.getElementById(id) && document.getElementById(id).value) || '';
        const vals = [get('reg_packing_presion_recepcion'), get('reg_packing_presion_ingreso_gasificado'), get('reg_packing_presion_salida_gasificado'), get('reg_packing_presion_ingreso_prefrio'), get('reg_packing_presion_salida_prefrio')];
        const res5 = validarPackingNumericoRequerido(vals);
        if (!res5.ok) { Swal.fire({ title: 'Validación', text: res5.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        const data = { recepcion: vals[0], ingreso_gasificado: vals[1], salida_gasificado: vals[2], ingreso_prefrio: vals[3], salida_prefrio: vals[4] };
        datosPacking.packing5.push(data);
        const tbody = document.getElementById('tbody-packing-presion');
        if (tbody) agregarFilaPacking5(data, tbody, datosPacking.packing5.length);
        actualizarContadorPacking('next_clam_packing_presion', datosPacking.packing5.length);
        ['reg_packing_presion_recepcion','reg_packing_presion_ingreso_gasificado','reg_packing_presion_salida_gasificado','reg_packing_presion_ingreso_prefrio','reg_packing_presion_salida_prefrio'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    });

    const btnAddPacking6 = document.getElementById('btn-add-packing-presion-fruta');
    if (btnAddPacking6) btnAddPacking6.addEventListener('click', () => {
        const get = id => (document.getElementById(id) && document.getElementById(id).value) || '';
        const vals = [get('reg_packing_presion_fruta_recepcion'), get('reg_packing_presion_fruta_ingreso_gasificado'), get('reg_packing_presion_fruta_salida_gasificado'), get('reg_packing_presion_fruta_ingreso_prefrio'), get('reg_packing_presion_fruta_salida_prefrio')];
        const res6 = validarPackingNumericoRequerido(vals);
        if (!res6.ok) { Swal.fire({ title: 'Validación', text: res6.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        const data = { recepcion: vals[0], ingreso_gasificado: vals[1], salida_gasificado: vals[2], ingreso_prefrio: vals[3], salida_prefrio: vals[4] };
        datosPacking.packing6.push(data);
        const tbody = document.getElementById('tbody-packing-presion-fruta');
        if (tbody) agregarFilaPacking6(data, tbody, datosPacking.packing6.length);
        actualizarContadorPacking('next_clam_packing_presion_fruta', datosPacking.packing6.length);
        ['reg_packing_presion_fruta_recepcion','reg_packing_presion_fruta_ingreso_gasificado','reg_packing_presion_fruta_salida_gasificado','reg_packing_presion_fruta_ingreso_prefrio','reg_packing_presion_fruta_salida_prefrio'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    });

    const btnAddPacking7 = document.getElementById('btn-add-deficit');
    if (btnAddPacking7) btnAddPacking7.addEventListener('click', () => {
        const get = id => (document.getElementById(id) && document.getElementById(id).value) || '';
        const vals = [get('reg_packing_deficit_recepcion'), get('reg_packing_deficit_ingreso_gasificado'), get('reg_packing_deficit_salida_gasificado'), get('reg_packing_deficit_ingreso_prefrio'), get('reg_packing_deficit_salida_prefrio')];
        const res7 = validarPackingNumericoOpcional(vals);
        if (!res7.ok) { Swal.fire({ title: 'Validación', text: res7.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        const data = { recepcion: vals[0], ingreso_gasificado: vals[1], salida_gasificado: vals[2], ingreso_prefrio: vals[3], salida_prefrio: vals[4] };
        datosPacking.packing7.push(data);
        const tbody = document.getElementById('tbody-packing-deficit');
        if (tbody) agregarFilaPacking7(data, tbody, datosPacking.packing7.length);
        actualizarContadorPacking('next_clam_deficit', datosPacking.packing7.length);
        ['reg_packing_deficit_recepcion','reg_packing_deficit_ingreso_gasificado','reg_packing_deficit_salida_gasificado','reg_packing_deficit_ingreso_prefrio','reg_packing_deficit_salida_prefrio'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    });

    const btnAddPacking8 = document.getElementById('btn-add-packing-obs');
    if (btnAddPacking8) btnAddPacking8.addEventListener('click', () => {
        const observacion = (document.getElementById('reg_packing_obs_texto') && document.getElementById('reg_packing_obs_texto').value) || '';
        datosPacking.packing8.push({ observacion });
        const tbody = document.getElementById('tbody-packing-obs');
        if (tbody) agregarFilaPacking8({ observacion }, tbody, datosPacking.packing8.length);
        actualizarContadorPacking('next_clam_packing_obs', datosPacking.packing8.length);
        if (document.getElementById('reg_packing_obs_texto')) document.getElementById('reg_packing_obs_texto').value = '';
    });

    // --- VISUAL: restaurar datos del ensayo al cambiar rótulo ---
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

    function actualizarContador(contadorId, valor) {
        const contador = document.getElementById(contadorId);
        if (contador) {
            contador.textContent = valor + 1;
        }
    }

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

    // --- Agregar fila: Visual (pesos), Jarras, Temperaturas, Tiempos, Humedad, Presión, Observación ---
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
            <td>${data.tipo === 'C' ? 'Cosecha' : (data.tipo === 'T' ? 'Traslado' : data.tipo)}</td>
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

    // --- Editar fila: Visual, Jarras, Temperaturas, Tiempos, Humedad, Presión, Observación ---
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

    function editarFilaJarras(rowNum, dataActual) {
        var htmlJarra = '<div class="packing-modal-grid">' +
            '<div class="packing-modal-field"><label>N° Jarra:</label><input type="number" id="edit_jarra" class="swal2-input" value="' + (dataActual.jarra || '') + '"></div>' +
            '<div class="packing-modal-field"><label>Tipo:</label><select id="edit_tipo" class="swal2-input"><option value="C"' + (dataActual.tipo === 'C' ? ' selected' : '') + '>Cosecha</option><option value="T"' + (dataActual.tipo === 'T' ? ' selected' : '') + '>Traslado</option></select></div>' +
            '<div class="packing-modal-field"><label>Hora Inicio:</label><input type="time" id="edit_inicio" class="swal2-input" value="' + (dataActual.inicio || '') + '"></div>' +
            '<div class="packing-modal-field"><label>Hora Término:</label><input type="time" id="edit_termino" class="swal2-input" value="' + (dataActual.termino || '') + '"></div>' +
            '</div>';
        Swal.fire({
            title: 'Editar Jarra #' + rowNum,
            customClass: { popup: 'packing-edit-modal' },
            html: htmlJarra,
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

    // --- Botones Añadir: Pesos, Jarras, Temperaturas, Tiempos, Humedad, Presión, Observación ---
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
            const maxClam = datosEnsayos.visual[ensayoActual].visual.length;
            if (datosEnsayos.visual[ensayoActual].temperaturas.length >= maxClam) {
                Swal.fire({
                    title: 'Límite alcanzado',
                    text: `Ya tienes ${maxClam} registros (máximo permitido según N° Clamshells).`,
                    icon: 'info',
                    confirmButtonColor: '#2f7cc0'
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
                if (v !== '' && !esNumeroNoNegativo(v)) {
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
            const maxClam = datosEnsayos.visual[ensayoActual].visual.length;
            if (datosEnsayos.visual[ensayoActual].tiempos.length >= maxClam) {
                Swal.fire({
                    title: 'Límite alcanzado',
                    text: `Ya tienes ${maxClam} registros (máximo permitido según N° Clamshells).`,
                    icon: 'info',
                    confirmButtonColor: '#2f7cc0'
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
            const maxClam = datosEnsayos.visual[ensayoActual].visual.length;
            if (datosEnsayos.visual[ensayoActual].humedad.length >= maxClam) {
                Swal.fire({
                    title: 'Límite alcanzado',
                    text: `Ya tienes ${maxClam} registros (máximo permitido según N° Clamshells).`,
                    icon: 'info',
                    confirmButtonColor: '#2f7cc0'
                });
                return;
            }
            const ids = ['reg_humedad_inicio', 'reg_humedad_termino', 'reg_humedad_llegada', 'reg_humedad_despacho'];
            const vals = ids.map(id => (document.getElementById(id) && document.getElementById(id).value || '').trim());
            for (let i = 0; i < ids.length; i++) {
                if (vals[i] !== '' && !esNumeroNoNegativo(vals[i])) {
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
            const maxClam = datosEnsayos.visual[ensayoActual].visual.length;
            if (datosEnsayos.visual[ensayoActual].presionambiente.length >= maxClam) {
                Swal.fire({
                    title: 'Límite alcanzado',
                    text: `Ya tienes ${maxClam} registros (máximo permitido según N° Clamshells).`,
                    icon: 'info',
                    confirmButtonColor: '#2f7cc0'
                });
                return;
            }
            const ids = ['reg_presion_amb_inicio', 'reg_presion_amb_termino', 'reg_presion_amb_llegada', 'reg_presion_amb_despacho'];
            const vals = ids.map(id => (document.getElementById(id) && document.getElementById(id).value || '').trim());
            for (let i = 0; i < ids.length; i++) {
                if (vals[i] !== '' && !esNumeroNoNegativo(vals[i])) {
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
            const maxClam = datosEnsayos.visual[ensayoActual].visual.length;
            if (datosEnsayos.visual[ensayoActual].presionfruta.length >= maxClam) {
                Swal.fire({
                    title: 'Límite alcanzado',
                    text: `Ya tienes ${maxClam} registros (máximo permitido según N° Clamshells).`,
                    icon: 'info',
                    confirmButtonColor: '#2f7cc0'
                });
                return;
            }
            const ids = ['reg_presion_fruta_inicio', 'reg_presion_fruta_termino', 'reg_presion_fruta_llegada', 'reg_presion_fruta_despacho'];
            const vals = ids.map(id => (document.getElementById(id) && document.getElementById(id).value || '').trim());
            for (let i = 0; i < ids.length; i++) {
                if (vals[i] !== '' && !esNumeroNoNegativo(vals[i])) {
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
            const maxClam = datosEnsayos.visual[ensayoActual].visual.length;
            if (datosEnsayos.visual[ensayoActual].observacion.length >= maxClam) {
                Swal.fire({
                    title: 'Límite alcanzado',
                    text: `Ya tienes ${maxClam} registros (máximo permitido según N° Clamshells).`,
                    icon: 'info',
                    confirmButtonColor: '#2f7cc0'
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

    // --- Guardado final Visual: join datos, saveLocal, POST cuando hay conexión ---
    const btnGuardarGeneral = document.getElementById('btn-guardar-registro');

    if (btnGuardarGeneral) {
        let isSaving = false;
        let lastSaveAt = 0;
        const COOLDOWN_MS = 3000;
        const guardarText = btnGuardarGeneral.querySelector('.btn-guardar-text');
        const guardarSpinner = document.getElementById('spinner_guardar');
        const toggleSaving = (saving) => {
            isSaving = saving;
            btnGuardarGeneral.disabled = saving;
            btnGuardarGeneral.style.opacity = saving ? '0.7' : '1';
            if (guardarText) guardarText.textContent = saving ? 'Guardando...' : 'GUARDAR REGISTRO';
            if (guardarSpinner) guardarSpinner.style.display = saving ? 'inline-block' : 'none';
        };

        btnGuardarGeneral.addEventListener('click', async () => {
            if (isSaving) return;
            if (Date.now() - lastSaveAt < COOLDOWN_MS) return;
            toggleSaving(true);

            const form = document.getElementById('cosecha-form');
            
            if (!form.checkValidity()) {
                form.reportValidity();
                toggleSaving(false);
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
                toggleSaving(false);
                return;
            }

            const rotuloSeleccionado = document.getElementById('reg_rotulo_ensayo').value;

            const datosDelTipo = datosEnsayos[tipoMedicion];
            // Incluir TODOS los ensayos que tengan al menos una fila en Visual (1, 2, 3, 4 de forma independiente)
            const ensayosAIncluir = [1, 2, 3, 4].filter(function(e) {
                const ed = datosDelTipo[e];
                return ed && ed.visual && ed.visual.length > 0;
            });

            if (ensayosAIncluir.length === 0) {
                Swal.fire({
                    title: 'Atención',
                    text: 'Debes agregar al menos un registro de peso (Visual) en algún ensayo (1, 2, 3 o 4).',
                    icon: 'warning',
                    confirmButtonColor: '#2f7cc0'
                });
                toggleSaving(false);
                return;
            }

            // Persistir la cabecera del ensayo actual (el que está seleccionado en el rótulo) antes de armar filas
            if (rotuloSeleccionado) guardarFormHeaderEnEnsayo(rotuloSeleccionado);

            // Construir filas planas de 50 columnas: UNA fila por cada registro del ensayo seleccionado (todas las filas en orden)
            const allRows = [];
            
            for (let numEnsayo of ensayosAIncluir) {
                if (!datosDelTipo[numEnsayo]) continue;
                const ensayo = datosDelTipo[numEnsayo];
                
                if (ensayo.visual && ensayo.visual.length > 0) {
                    
                    // Normalizar n_jarra para comparar (string vs number)
                    const normJarra = (v) => (v == null || v === '') ? '' : String(v).trim();
                    // JOIN entre visual y jarras por n_jarra
                    const registrosCombinados = ensayo.visual.map((visual, index) => {
                        const vJarra = normJarra(visual.jarra);
                        // Buscar jarras tipo C y T para esta jarra
                        const jarraC = ensayo.jarras ? ensayo.jarras.find(j => normJarra(j.jarra) === vJarra && j.tipo === 'C') : null;
                        const jarraT = ensayo.jarras ? ensayo.jarras.find(j => normJarra(j.jarra) === vJarra && j.tipo === 'T') : null;
                        
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
                    
                    // Caso BACKUP: Jarras con tiempos pero sin peso (capturar C y T; no dejar datos en el aire)
                    if (ensayo.jarras) {
                        const nJarraNum = (j) => parseInt(j.jarra) || 0;
                        ensayo.jarras.forEach(jarra => {
                            const nJarra = nJarraNum(jarra);
                                const esC = jarra.tipo === 'C';
                                const esT = jarra.tipo === 'T';
                            const existente = registrosCombinados.find(r => r.n_jarra === nJarra);
                            if (!existente) {
                                registrosCombinados.push({
                                    n_clamshell: 0,
                                    n_jarra: nJarra,
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
                            } else if (existente.n_clamshell === 0) {
                                // Misma jarra ya tiene fila (p.ej. por C); completar con T o C que falte
                                if (esC && !existente.inicio_c) {
                                    existente.inicio_c = jarra.inicio || '';
                                    existente.termino_c = jarra.termino || '';
                                    existente.min_c = jarra.tiempo || '';
                                }
                                if (esT && !existente.inicio_t) {
                                    existente.inicio_t = jarra.inicio || '';
                                    existente.termino_t = jarra.termino || '';
                                    existente.min_t = jarra.tiempo || '';
                                }
                            }
                        });
                    }
                    
                    // Cabecera de ESTE ensayo (cada ensayo tiene su propia fecha, responsable, etc.)
                    const headerEnsayo = (datosEnsayos.visual[numEnsayo] && datosEnsayos.visual[numEnsayo].formHeader) || {};
                    const elVal = function(id) { var x = document.getElementById(id); return x ? (x.value || '') : ''; };
                    const fecha = (headerEnsayo.fecha != null && headerEnsayo.fecha !== '') ? headerEnsayo.fecha : elVal('reg_fecha');
                    const responsable = (headerEnsayo.responsable != null && headerEnsayo.responsable !== '') ? headerEnsayo.responsable : elVal('reg_responsable');
                    const guia_remision = (headerEnsayo.guia_remision != null && headerEnsayo.guia_remision !== '') ? headerEnsayo.guia_remision : elVal('reg_guia_remision');
                    const variedad = (headerEnsayo.variedad != null && headerEnsayo.variedad !== '') ? headerEnsayo.variedad : elVal('reg_variedad');
                    const placa_vehiculo = (headerEnsayo.placa != null && headerEnsayo.placa !== '') ? headerEnsayo.placa : elVal('reg_placa');
                    const hora_inicio = (headerEnsayo.hora_inicio != null && headerEnsayo.hora_inicio !== '') ? headerEnsayo.hora_inicio : (elVal('reg_hora_inicio') || '07:15');
                    const dias_precosecha = (headerEnsayo.dias_precosecha != null && headerEnsayo.dias_precosecha !== '') ? headerEnsayo.dias_precosecha : (elVal('reg_dias_precosecha') || '');
                    const traz_etapa = (headerEnsayo.traz_etapa != null && headerEnsayo.traz_etapa !== '') ? headerEnsayo.traz_etapa : elVal('reg_traz_etapa');
                    const traz_campo = (headerEnsayo.traz_campo != null && headerEnsayo.traz_campo !== '') ? headerEnsayo.traz_campo : elVal('reg_traz_campo');
                    const traz_libre = (headerEnsayo.traz_libre != null && headerEnsayo.traz_libre !== '') ? headerEnsayo.traz_libre : (elVal('reg_traz_libre') || '');
                    const fundo = (headerEnsayo.fundo != null && headerEnsayo.fundo !== '') ? headerEnsayo.fundo : (elVal('reg_fundo') || '');
                    const observacion_header = (headerEnsayo.observacion != null && headerEnsayo.observacion !== '') ? headerEnsayo.observacion : (elVal('reg_observacion_formato') || '');
                    const ensayo_numero = parseInt(numEnsayo);
                    const ensayo_nombre = 'Ensayo ' + numEnsayo;

                    // Convertir cada registro a fila plana de 52 columnas (FUNDO, OBSERVACION_FORMATO; sin TEMP_AMB)
                    registrosCombinados.forEach(reg => {
                        const tm = reg.temperatura_muestra;
                        const ti = reg.tiempos;
                        const hr = reg.humedad_relativa;
                        const pva = reg.presion_vapor_ambiente;
                        const pvf = reg.presion_vapor_fruta;

                        const row = [
                            fecha, responsable, guia_remision, variedad, placa_vehiculo, hora_inicio, dias_precosecha,
                            traz_etapa, traz_campo, traz_libre, fundo, observacion_header,
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
                            (typeof reg.observacion === 'string' ? reg.observacion : (reg.observacion && reg.observacion.observacion)) || ''
                        ];
                        allRows.push(row);
                    });
                }
            }

            // Log para depuración: qué filas se van a guardar y enviar
            console.log('[GUARDAR REGISTRO] Filas construidas:', allRows.length);
            console.log('[GUARDAR REGISTRO] Payload (rows):', JSON.stringify(allRows.map((r, i) => ({ index: i + 1, n_clamshell: r[14], n_jarra: r[15], ensayo: r[12] }))));
            if (allRows.length > 0) console.log('[GUARDAR REGISTRO] Primera fila (52 cols):', allRows[0]);
            if (allRows.length > 1) console.log('[GUARDAR REGISTRO] Última fila (52 cols):', allRows[allRows.length - 1]);

            try {
                toggleSaving(false);

                const generarPDF = () => {
                    if (!window.jspdf) {
                        if (typeof Swal !== 'undefined') Swal.fire({
                            title: 'PDF no disponible',
                            html: 'La librería para generar el PDF no está cargada.<br><br><strong>Con internet:</strong> recarga la página.<br><strong>Sin internet:</strong> descarga <code>jspdf.umd.min.js</code> (versión 2.5.1) y colócala en la carpeta <code>librerias/</code> de la aplicación; así el PDF funcionará también offline.',
                            icon: 'warning',
                            confirmButtonColor: '#2f7cc0'
                        });
                        return null;
                    }
                    try {
                        const { jsPDF } = window.jspdf;
                        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
                        const pageW = doc.internal.pageSize.getWidth();
                        const pageH = doc.internal.pageSize.getHeight();
                        const contentWidth = 180;
                        const margin = (pageW - contentWidth) / 2;
                        let y = 6;
                        const fontSize = 9;
                        const r0 = allRows[0] || [];
                        const fundoLabel = (r0[10] || 'C5-C6-A9-LN').toString().toUpperCase().replace(/\b\w/g, l => l.toUpperCase());
                        const trazabilidadStr = [r0[7], r0[8], r0[9]].filter(Boolean).length ? 'E' + (r0[7] || '') + '-C' + (r0[8] || '') + (r0[9] ? '-' + r0[9] : '') : (r0[7] || '') + '/' + (r0[8] || '');

                        doc.setDrawColor(0, 0, 0);
                        doc.setLineWidth(0.3);
                        const headerH = 18;
                        const headerLeftW = 36;
                        const headerRightW = 36;
                        const headerCenterW = contentWidth - headerLeftW - headerRightW;
                        doc.rect(margin, y, headerLeftW, headerH);
                        doc.setFontSize(10);
                        doc.setFont(undefined, 'bold');
                        doc.text('AGROVISION', margin + headerLeftW / 2, y + headerH / 2 + 1.5, { align: 'center' });
                        doc.rect(margin + headerLeftW, y, headerCenterW, headerH);
                        const tituloEncabezado = 'FORMATO MEDICIÓN DE TIEMPOS, TEMPERATURA Y PESOS EN COSECHA ARÁNDANO- C5-C6-A9-LN';
                        const anchoTitulo = headerCenterW - 4;
                        doc.setFontSize(7);
                        const lineasTitulo = doc.splitTextToSize(tituloEncabezado, anchoTitulo);
                        const tituloY = y + (headerH - (lineasTitulo.length * 3.5)) / 2 + 2.5;
                        lineasTitulo.forEach((line, i) => {
                            doc.text(line, margin + headerLeftW + headerCenterW / 2, tituloY + i * 3.5, { align: 'center' });
                        });
                        doc.rect(margin + headerLeftW + headerCenterW, y, headerRightW, headerH);
                        doc.setFont(undefined, 'normal');
                        doc.setFontSize(8);
                        doc.text('Código: PE-F-QPH-306', margin + contentWidth - headerRightW + 2, y + 5, { align: 'left' });
                        doc.text('Versión: 1', margin + contentWidth - headerRightW + 2, y + 9.5, { align: 'left' });
                        const genStr = (function() {
                            const now = new Date();
                            return 'Generado: ' + now.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
                        })();
                        doc.setFontSize(6);
                        doc.text(genStr, margin + contentWidth - headerRightW + 2, y + 14.5, { align: 'left' });
                        y += headerH + 3;

                        doc.setDrawColor(0, 0, 0);
                        doc.setLineWidth(0.2);
                        const blockH = 43;
                        doc.rect(margin, y, contentWidth, blockH);
                        y += 3;
                        const bullet = '\u2022';
                        doc.setFontSize(8);
                        doc.setFont(undefined, 'bold');
                        doc.text('Datos del registro', margin + contentWidth / 2, y, { align: 'center' });
                        y += 5;
                        doc.setFont(undefined, 'normal');
                        const camposPDF = [
                            { label: 'Tipo de Medición', value: 'Calibrado Visual' },
                            { label: 'Rótulo de Muestra', value: String(r0[13] || '') },
                            { label: 'Fecha', value: String(r0[0] || '') },
                            { label: 'Responsable', value: String(r0[1] || '') },
                            { label: 'Trazabilidad', value: trazabilidadStr },
                            { label: 'Guía Remisión Acopio', value: String(r0[2] || '') },
                            { label: 'Variedad', value: String(r0[3] || '') },
                            { label: 'Placa Vehículo', value: String(r0[4] || '') },
                            { label: 'Hora Inicio General', value: String(r0[5] || '') },
                            { label: 'Días Precosecha / N°', value: String(r0[6] || '') },
                            { label: 'Fundo', value: String(r0[10] || '') },
                            { label: 'Observación', value: String(r0[11] || '').substring(0, 45) }
                        ];
                        const colW = contentWidth / 2;
                        const leftX = margin + 3;
                        const rightX = margin + colW + 3;
                        const rowH = 5.2;
                        for (let i = 0; i < camposPDF.length; i += 2) {
                            const c0 = camposPDF[i];
                            const c1 = camposPDF[i + 1];
                            doc.setFont(undefined, 'normal');
                            doc.text(bullet + ' ' + c0.label + ': ', leftX, y);
                            doc.setFont(undefined, 'bold');
                            doc.text((c0.value || '\u2014'), leftX + doc.getTextWidth(bullet + ' ' + c0.label + ': '), y);
                            if (c1) {
                                doc.setFont(undefined, 'normal');
                                doc.text(bullet + ' ' + c1.label + ': ', rightX, y);
                                doc.setFont(undefined, 'bold');
                                doc.text((c1.value || '\u2014'), rightX + doc.getTextWidth(bullet + ' ' + c1.label + ': '), y);
                            }
                            y += rowH;
                        }
                        y += 5;

                        doc.setDrawColor(0, 0, 0);
                        doc.setLineWidth(0.4);
                        const lineH = 6;
                        const yMax = 268;

                        const drawTable = (titulo, headers, indices, rows, maxLen) => {
                            const dataRows = (rows || allRows).slice(0, 15);
                            const totalTableH = (1 + dataRows.length) * lineH;
                            const sectionH = 5 + 4 + totalTableH + 4;
                            if (y + sectionH > yMax) {
                                doc.addPage();
                                y = 10;
                            }
                            y += 5;
                            doc.setFontSize(fontSize);
                            doc.setFont(undefined, 'bold');
                            doc.text(titulo, margin, y, { align: 'left' });
                            y += 4;
                            doc.setFont(undefined, 'normal');
                            const nCol = headers.length;
                            const tableColW = contentWidth / Math.max(nCol, 1);
                            const totalH = (1 + dataRows.length) * lineH;
                            const startY = y;
                            doc.rect(margin, startY, contentWidth, totalH);
                            for (let c = 1; c < nCol; c++) doc.line(margin + c * tableColW, startY, margin + c * tableColW, startY + totalH);
                            for (let r = 0; r <= dataRows.length + 1; r++) doc.line(margin, startY + r * lineH, margin + contentWidth, startY + r * lineH);
                            const headerFont = nCol >= 8 ? 5.5 : (nCol > 6 ? 6 : 7);
                            doc.setFontSize(headerFont);
                            headers.forEach((h, i) => doc.text(h, margin + i * tableColW + tableColW / 2, startY + lineH / 2 + 1.2, { align: 'center' }));
                            const cellFont = nCol >= 8 ? 7 : (nCol > 6 ? 7 : 8);
                            doc.setFontSize(cellFont);
                            y = startY + lineH;
                            dataRows.forEach((row, rowIdx) => {
                                indices.forEach((idx, i) => {
                                    const isItemCol = (headers[0] === 'ITEM' && i === 0);
                                    const val = isItemCol ? String(rowIdx + 1) : String(row[idx] ?? '');
                                    const len = (maxLen && maxLen[i] !== undefined) ? maxLen[i] : (nCol === 1 ? 50 : 12);
                                    doc.text(val.substring(0, len), margin + i * tableColW + tableColW / 2, y + lineH / 2 + 1.2, { align: 'center' });
                                });
                                y += lineH;
                            });
                            doc.setFontSize(fontSize);
                            y += 4;
                        };

                        drawTable('1. Tiempo de llenado de jarras (hora)', ['ITEM', 'N° JARRA', 'INICIO COSECHA', 'TÉRMINO COSECHA', 'TIEMPO (min)', 'INICIO TRASLADO', 'TÉRMINO TRASLADO', 'TIEMPO TRASL. (min)'], [14, 15, 20, 21, 22, 23, 24, 25], allRows);
                        drawTable('2. Entrada de pesos: Visual', ['N° CLAM', 'N° JARRA', 'PESO 1 (g)', 'PESO 2 (g)', 'LLEGADA ACOPIO (g)', 'DESPACHO ACOPIO (g)'], [14, 15, 16, 17, 18, 19], allRows);
                        drawTable('3. Tiempos de la muestra (hora)', ['N° CLAM', 'INICIO COSECHA', 'PÉRDIDA PESO', 'TÉRMINO COSECHA', 'LLEGADA ACOPIO', 'DESPACHO ACOPIO'], [14, 34, 35, 36, 37, 38], allRows);
                        drawTable('4. Temperatura muestra (°C)', ['N° CLAM', 'INICIO AMB.', 'INICIO PULPA', 'TÉRMINO AMB.', 'TÉRMINO PULPA', 'LLEGADA AMB.', 'LLEGADA PULPA', 'DESP. AMB.', 'DESP. PULPA'], [14, 26, 27, 28, 29, 30, 31, 32, 33], allRows);
                        drawTable('5. Humedad relativa (%)', ['N° CLAM', 'INICIO', 'TÉRMINO', 'LLEGADA ACOPIO', 'DESPACHO ACOPIO'], [14, 39, 40, 41, 42], allRows);
                        drawTable('6. Presión de vapor ambiente (Kpa)', ['N° CLAM', 'INICIO', 'TÉRMINO', 'LLEGADA ACOPIO', 'DESPACHO ACOPIO'], [14, 43, 44, 45, 46], allRows);
                        drawTable('7. Presión de vapor fruta (Kpa)', ['N° CLAM', 'INICIO', 'TÉRMINO', 'LLEGADA ACOPIO', 'DESPACHO ACOPIO'], [14, 47, 48, 49, 50], allRows);
                        drawTable('8. Observaciones por muestra', ['N° CLAM', 'DETALLE DE LA OBSERVACIÓN'], [14, 51], allRows, [8, 45]);

                        const nombreArchivo = 'MTTP_Registro_' + (r0[0] || 'fecha') + '_Ensayo' + (ensayosAIncluir.join('-')) + '.pdf';
                        const blob = doc.output('blob');
                        return { blobUrl: URL.createObjectURL(blob), nombreArchivo };
                    } catch (e) {
                        console.error(e);
                        if (typeof Swal !== 'undefined') Swal.fire({ title: 'Error', text: 'No se pudo generar el PDF.', icon: 'error' });
                        return null;
                    }
                };

                Swal.fire({
                    title: '¿Qué deseas hacer?',
                    html: 'Se van a guardar <strong>' + allRows.length + '</strong> filas de <strong>' + ensayosAIncluir.length + '</strong> ensayo(s) (Ensayo ' + ensayosAIncluir.join(', Ensayo ') + ').<br><br>' +
                        '• <strong>Guardar</strong>: guarda el registro (y se enviará al servidor cuando haya conexión).<br>' +
                        '• <strong>Ver PDF</strong>: abre una vista previa del PDF; ahí puedes descargarlo o cerrar.<br>' +
                        '• <strong>Cancelar</strong>: no guarda; puedes seguir editando.',
                    icon: 'question',
                    showDenyButton: true,
                    showCancelButton: true,
                    confirmButtonText: 'Guardar',
                    denyButtonText: 'Ver PDF',
                    cancelButtonText: 'Cancelar',
                    confirmButtonColor: '#2f7cc0',
                    denyButtonColor: '#28a745',
                    cancelButtonColor: '#6c757d'
                }).then(async (result) => {
                    if (result.isConfirmed) {
                        Swal.close();
                        toggleSaving(true);
                        const secciones = ['temperaturas', 'tiempos', 'humedad', 'presionambiente', 'presionfruta', 'observacion'];
                        const nombresSeccion = { temperaturas: 'Temperaturas', tiempos: 'Tiempos', humedad: 'Humedad', presionambiente: 'Presión ambiente', presionfruta: 'Presión fruta', observacion: 'Observación' };
                        for (let numE of ensayosAIncluir) {
                            const ensayoData = datosDelTipo[numE];
                            const totalVisual = ensayoData.visual.length;
                            for (let seccion of secciones) {
                                if (ensayoData[seccion] && ensayoData[seccion].length > 0 && ensayoData[seccion].length !== totalVisual) {
                                    toggleSaving(false);
                                    await Swal.fire({
                                        title: 'Inconsistencia de filas',
                                        html: `El <strong>Ensayo ${numE}</strong> tiene <strong>${totalVisual}</strong> filas en Visual, pero <strong>${ensayoData[seccion].length}</strong> en ${nombresSeccion[seccion] || seccion}.<br><br>Las filas deben coincidir en total (Jarras puede tener más o menos).`,
                                        icon: 'error',
                                        confirmButtonColor: '#d33'
                                    });
                                    return;
                                }
                            }
                        }
                        let rowsToSave = allRows;
                        let duplicadosExcluidos = [];
                        if (navigator.onLine) {
                            try {
                                const duplicados = [];
                                for (let numE of ensayosAIncluir) {
                                    const header = datosEnsayos.visual[numE] && datosEnsayos.visual[numE].formHeader;
                                    const fechaEnsayo = (header && header.fecha) ? String(header.fecha).trim() : '';
                                    if (fechaEnsayo) {
                                        const resExiste = await existeRegistroFechaEnsayo(fechaEnsayo, numE);
                                        if (resExiste.ok && resExiste.existe) duplicados.push({ fecha: fechaEnsayo, numE });
                                    }
                                }
                                if (duplicados.length > 0) {
                                    const msg = duplicados.length === 1
                                        ? 'El <strong>Ensayo ' + duplicados[0].numE + '</strong> ya está registrado para la fecha ' + duplicados[0].fecha + '.'
                                        : 'Los ensayos <strong>' + duplicados.map(d => d.numE).join(', ') + '</strong> ya están registrados para su fecha.';
                                    const resultDup = await Swal.fire({
                                        title: 'Ya registrado',
                                        html: msg + '<br><br>¿Guardar solo los que no se repiten?',
                                        icon: 'info',
                                        showCancelButton: true,
                                        confirmButtonText: 'Considerar solo las que no se repiten',
                                        cancelButtonText: 'OK',
                                        confirmButtonColor: '#2f7cc0',
                                        cancelButtonColor: '#6c757d'
                                    });
                                    if (!resultDup.isConfirmed) {
                                        toggleSaving(false);
                                        return;
                                    }
                                    const duplicateSet = new Set(duplicados.map(d => d.fecha + '|' + d.numE));
                                    rowsToSave = allRows.filter(row => !duplicateSet.has(String(row[0] || '').trim() + '|' + row[12]));
                                    duplicadosExcluidos = [...duplicados];
                                    if (rowsToSave.length === 0) {
                                        toggleSaving(false);
                                        await Swal.fire({
                                            title: 'Sin registros',
                                            text: 'No hay registros para guardar (todos están ya registrados).',
                                            icon: 'info',
                                            confirmButtonColor: '#2f7cc0'
                                        });
                                        return;
                                    }
                                }
                            } catch (_) {}
                        }
                        Swal.fire({
                            title: 'Se está guardando...',
                            text: 'Un momento por favor.',
                            allowOutsideClick: false,
                            allowEscapeKey: false,
                            didOpen: () => { Swal.showLoading(); }
                        });
                lastSaveAt = Date.now();
                        const uid = saveLocal({ rows: rowsToSave });
                        const esperarHastaRegistrado = (id, maxMs) => new Promise((resolve) => {
                            const start = Date.now();
                            const check = () => {
                                const items = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
                                const item = items.find(i => i.uid === id);
                                if (!item || item.status !== 'pendiente' || (Date.now() - start >= maxMs)) {
                                    resolve();
                                    return;
                                }
                                setTimeout(check, 350);
                            };
                            check();
                        });
                        if (uid) await esperarHastaRegistrado(uid, 14000);
                        if (duplicadosExcluidos.length > 0) {
                            const current = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
                            const timestamp = new Date().toLocaleString();
                            duplicadosExcluidos.forEach(d => {
                                const rowsForD = allRows.filter(r => String(r[0] || '').trim() === d.fecha && r[12] === d.numE);
                                if (rowsForD.length) {
                                    current.push({
                                        uid: 'REG-' + Date.now() + '-' + d.fecha + '-' + d.numE + '-' + Math.random().toString(36).substr(2, 4),
                                        timestamp,
                                        rows: rowsForD,
                                        status: 'rechazado_duplicado',
                                        rechazoMotivo: 'No se guardó porque ya estaba registrado (se eligió guardar solo los no repetidos).'
                                    });
                                }
                            });
                            localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
                updateUI();
                        }
                window.formHasChanges = false;
                if (typeof renderHistorial === 'function') renderHistorial(false);
                    document.getElementById('cosecha-form').reset();
                    if (campoFecha) campoFecha.value = fechaLocalHoy();
                    window.location.reload();
                    } else if (result.isDenied) {
                        const pdfResult = generarPDF();
                        if (pdfResult && pdfResult.blobUrl) {
                            Swal.fire({
                                title: 'Vista previa del PDF',
                                html: '<iframe src="' + pdfResult.blobUrl + '" style="width:100%;height:70vh;border:1px solid #ddd;border-radius:4px"></iframe>',
                                width: 920,
                                showConfirmButton: false,
                                showDenyButton: true,
                                denyButtonText: 'Descargar PDF',
                                showCancelButton: true,
                                cancelButtonText: 'Cerrar',
                                denyButtonColor: '#28a745',
                                cancelButtonColor: '#6c757d'
                            }).then((r) => {
                                if (r.isDenied) {
                                    const a = document.createElement('a');
                                    a.href = pdfResult.blobUrl;
                                    a.download = pdfResult.nombreArchivo;
                                    a.click();
                                }
                            });
                        }
                    }
                });
            } catch (err) {
                toggleSaving(false);
                console.error(err);
                Swal.fire({ title: 'Error', text: 'No se pudo guardar. Revisa la consola.', icon: 'error', confirmButtonColor: '#d33' });
            }
        });
    }
});