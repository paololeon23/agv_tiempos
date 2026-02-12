document.addEventListener('DOMContentLoaded', () => {
        
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
    // 4. INTERFAZ DE USUARIO (SIDEBAR)
    // ========================================
    const sidebar = document.getElementById('sidebar');
    const menuBtn = document.getElementById('menu-btn');
    const closeBtn = document.getElementById('close-btn');

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
    // 6. MANEJO DEL FORMULARIO (SUBMIT)
    // ========================================
    const cosechaForm = document.getElementById('cosecha-form');
    if (cosechaForm) {
        cosechaForm.addEventListener('submit', (e) => {
            e.preventDefault();
        });
    }

    // ========================================
    // 7. SISTEMA DE MEDICIÓN - CONFIGURACIÓN
    // ========================================
    
    const selectMedicion = document.getElementById('tipo_medicion');
    const selectRotulo = document.getElementById('reg_rotulo_ensayo');
    
    const wrappers = {
        visual: document.getElementById('wrapper_visual'),
        jarras: document.getElementById('wrapper_jarras'),
        temperaturas: document.getElementById('wrapper_temperaturas'),
        tiempos: document.getElementById('wrapper_tiempos'),
        humedad: document.getElementById('wrapper_humedad'),
        tempambiente: document.getElementById('wrapper_tempambiente'),
        presionambiente: document.getElementById('wrapper_presionambiente'),
        presionfruta: document.getElementById('wrapper_presionfruta'),
        observacion: document.getElementById('wrapper_observacion'),
        acopio: document.getElementById('wrapper_acopio')
    };

    // Almacenamiento de datos por ensayo y tipo
    const datosEnsayos = {
        visual: {
            1: { 
                visual: [],
                jarras: [],
                temperaturas: [],
                tiempos: [],
                humedad: [],
                tempambiente: [],
                presionambiente: [],
                presionfruta: [],
                observacion: []
            },
            2: { visual: [], jarras: [], temperaturas: [], tiempos: [], humedad: [], tempambiente: [], presionambiente: [], presionfruta: [], observacion: [] },
            3: { visual: [], jarras: [], temperaturas: [], tiempos: [], humedad: [], tempambiente: [], presionambiente: [], presionfruta: [], observacion: [] },
            4: { visual: [], jarras: [], temperaturas: [], tiempos: [], humedad: [], tempambiente: [], presionambiente: [], presionfruta: [], observacion: [] }
        },
        acopio: {
            1: { acopio: [] },
            2: { acopio: [] },
            3: { acopio: [] },
            4: { acopio: [] }
        }
    };

    let tipoActual = '';
    let ensayoActual = '';

    // ========================================
    // CAMBIO DE TIPO DE MEDICIÓN
    // ========================================
    if (selectMedicion) {
        selectMedicion.addEventListener('change', function() {
            tipoActual = this.value;
            
            if (this.value === 'visual') {
                wrappers.visual.style.display = 'block';
                wrappers.jarras.style.display = 'block';
                wrappers.temperaturas.style.display = 'block';
                wrappers.tiempos.style.display = 'block';
                wrappers.humedad.style.display = 'block';
                wrappers.tempambiente.style.display = 'block';
                wrappers.presionambiente.style.display = 'block';
                wrappers.presionfruta.style.display = 'block';
                wrappers.observacion.style.display = 'block';
                wrappers.acopio.style.display = 'none';
                
            } else if (this.value === 'acopio') {
                wrappers.visual.style.display = 'none';
                wrappers.jarras.style.display = 'none';
                wrappers.temperaturas.style.display = 'none';
                wrappers.tiempos.style.display = 'none';
                wrappers.humedad.style.display = 'none';
                wrappers.tempambiente.style.display = 'none';
                wrappers.presionambiente.style.display = 'none';
                wrappers.presionfruta.style.display = 'none';
                wrappers.observacion.style.display = 'none';
                wrappers.acopio.style.display = 'block';
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
        selectRotulo.addEventListener('change', function() {
            ensayoActual = this.value;
            
            if (tipoActual) {
                restaurarDatosEnsayo(tipoActual, ensayoActual);
            }
        });
    }

    // ========================================
    // RESTAURAR DATOS DEL ENSAYO
    // ========================================
    function restaurarDatosEnsayo(tipo, ensayo) {
        if (tipo === 'visual') {
            const datos = datosEnsayos.visual[ensayo];
            
            // Restaurar Visual (Pesos)
            const tbodyVisual = document.getElementById('tbody-visual');
            if (tbodyVisual) {
                tbodyVisual.innerHTML = '';
                datos.visual.forEach((item, index) => {
                    agregarFilaVisual(item, tbodyVisual, index + 1);
                });
                actualizarContador('next_clam_visual', datos.visual.length);
            }
            
            // Restaurar Jarras
            const tbodyJarras = document.getElementById('tbody-jarras');
            if (tbodyJarras) {
                tbodyJarras.innerHTML = '';
                datos.jarras.forEach((item, index) => {
                    agregarFilaJarras(item, tbodyJarras, index + 1);
                });
                actualizarContador('next_row_jarras', datos.jarras.length);
            }
            
            // Restaurar Temperaturas
            const tbodyTemp = document.getElementById('tbody-temperaturas');
            if (tbodyTemp) {
                tbodyTemp.innerHTML = '';
                datos.temperaturas.forEach((item, index) => {
                    agregarFilaTemperaturas(item, tbodyTemp, index + 1);
                });
                actualizarContador('next_clam_temp', datos.temperaturas.length);
            }
            
            // Restaurar Tiempos
            const tbodyTiempos = document.getElementById('tbody-tiempos');
            if (tbodyTiempos) {
                tbodyTiempos.innerHTML = '';
                datos.tiempos.forEach((item, index) => {
                    agregarFilaTiempos(item, tbodyTiempos, index + 1);
                });
                actualizarContador('next_clam_tiempos', datos.tiempos.length);
            }
            
            // Restaurar Humedad
            const tbodyHumedad = document.getElementById('tbody-humedad');
            if (tbodyHumedad) {
                tbodyHumedad.innerHTML = '';
                datos.humedad.forEach((item, index) => {
                    agregarFilaHumedad(item, tbodyHumedad, index + 1);
                });
                actualizarContador('next_clam_humedad', datos.humedad.length);
            }
            
            // Restaurar Temp Ambiente
            const tbodyTempAmb = document.getElementById('tbody-temp-ambiente');
            if (tbodyTempAmb) {
                tbodyTempAmb.innerHTML = '';
                datos.tempambiente.forEach((item, index) => {
                    agregarFilaTempAmbiente(item, tbodyTempAmb, index + 1);
                });
                actualizarContador('next_clam_temp_amb', datos.tempambiente.length);
            }
            
            // Restaurar Presión Ambiente
            const tbodyPresion = document.getElementById('tbody-presion');
            if (tbodyPresion) {
                tbodyPresion.innerHTML = '';
                datos.presionambiente.forEach((item, index) => {
                    agregarFilaPresionAmbiente(item, tbodyPresion, index + 1);
                });
                actualizarContador('next_clam_presion', datos.presionambiente.length);
            }
            
            // Restaurar Presión Fruta
            const tbodyPresionFruta = document.getElementById('tbody-presion-fruta');
            if (tbodyPresionFruta) {
                tbodyPresionFruta.innerHTML = '';
                datos.presionfruta.forEach((item, index) => {
                    agregarFilaPresionFruta(item, tbodyPresionFruta, index + 1);
                });
                actualizarContador('next_clam_presion_fruta', datos.presionfruta.length);
            }
            
            // Restaurar Observación
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
        if (diferencia < 0) diferencia += 24 * 60; // Si cruza medianoche
        
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
        row.setAttribute('data-obs', data.observacion);
        row.setAttribute('data-inicio', data.inicio);
        row.setAttribute('data-termino', data.termino);
        row.setAttribute('data-tiempo', data.tiempo);

        row.innerHTML = `
            <td class="row-id">${rowNum}</td>
            <td>${data.jarra}</td>
            <td>${data.observacion}</td>
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
        row.setAttribute('data-inicio-amb', data.inicio_amb);
        row.setAttribute('data-inicio-pul', data.inicio_pul);
        row.setAttribute('data-termino-amb', data.termino_amb);
        row.setAttribute('data-termino-pul', data.termino_pul);
        row.setAttribute('data-llegada-amb', data.llegada_amb);
        row.setAttribute('data-llegada-pul', data.llegada_pul);
        row.setAttribute('data-despacho-amb', data.despacho_amb);
        row.setAttribute('data-despacho-pul', data.despacho_pul);

        row.innerHTML = `
            <td class="clam-id">${clamNum}</td>
            <td>${data.inicio_amb}°C</td>
            <td>${data.inicio_pul}°C</td>
            <td>${data.termino_amb}°C</td>
            <td>${data.termino_pul}°C</td>
            <td>${data.llegada_amb}°C</td>
            <td>${data.llegada_pul}°C</td>
            <td>${data.despacho_amb}°C</td>
            <td>${data.despacho_pul}°C</td>
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
        row.setAttribute('data-inicio', data.inicio);
        row.setAttribute('data-termino', data.termino);
        row.setAttribute('data-llegada', data.llegada);
        row.setAttribute('data-despacho', data.despacho);

        row.innerHTML = `
            <td class="clam-id">${clamNum}</td>
            <td>${data.inicio}%</td>
            <td>${data.termino}%</td>
            <td>${data.llegada}%</td>
            <td>${data.despacho}%</td>
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
    // AGREGAR FILA - TEMP AMBIENTE
    // ========================================
    function agregarFilaTempAmbiente(data, tbody, clamNum) {
        const row = document.createElement('tr');
        row.setAttribute('data-clam', clamNum);
        row.setAttribute('data-inicio', data.inicio);
        row.setAttribute('data-termino', data.termino);
        row.setAttribute('data-llegada', data.llegada);
        row.setAttribute('data-despacho', data.despacho);

        row.innerHTML = `
            <td class="clam-id">${clamNum}</td>
            <td>${data.inicio}°C</td>
            <td>${data.termino}°C</td>
            <td>${data.llegada}°C</td>
            <td>${data.despacho}°C</td>
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
            editarFilaTempAmbiente(clamNum, data);
        });

        row.querySelector('.btn-delete-row').addEventListener('click', () => {
            eliminarFila('tempambiente', clamNum);
        });

        row.querySelector('.btn-replicate-row').addEventListener('click', () => {
            replicarFila('tempambiente', data);
        });
    }

    // ========================================
    // AGREGAR FILA - PRESIÓN AMBIENTE
    // ========================================
    function agregarFilaPresionAmbiente(data, tbody, clamNum) {
        const row = document.createElement('tr');
        row.setAttribute('data-clam', clamNum);
        row.setAttribute('data-inicio', data.inicio);
        row.setAttribute('data-termino', data.termino);
        row.setAttribute('data-llegada', data.llegada);
        row.setAttribute('data-despacho', data.despacho);

        row.innerHTML = `
            <td class="clam-id">${clamNum}</td>
            <td>${data.inicio} kPa</td>
            <td>${data.termino} kPa</td>
            <td>${data.llegada} kPa</td>
            <td>${data.despacho} kPa</td>
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
        row.setAttribute('data-inicio', data.inicio);
        row.setAttribute('data-termino', data.termino);
        row.setAttribute('data-llegada', data.llegada);
        row.setAttribute('data-despacho', data.despacho);

        row.innerHTML = `
            <td class="clam-id">${clamNum}</td>
            <td>${data.inicio} kPa</td>
            <td>${data.termino} kPa</td>
            <td>${data.llegada} kPa</td>
            <td>${data.despacho} kPa</td>
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
        row.setAttribute('data-obs', data.observacion);

        row.innerHTML = `
            <td class="clam-id">${clamNum}</td>
            <td>${data.observacion}</td>
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
                const jarra = document.getElementById('edit_jarra').value;
                const p1 = document.getElementById('edit_p1').value;
                const p2 = document.getElementById('edit_p2').value;
                const llegada = document.getElementById('edit_llegada').value;
                const despacho = document.getElementById('edit_despacho').value;

                if (!jarra || !p1 || !p2 || !llegada || !despacho) {
                    Swal.showValidationMessage('Todos los campos son obligatorios');
                    return false;
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
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Observación:</label>
                        <input type="text" id="edit_obs" class="swal2-input" value="${dataActual.observacion}" style="width: 90%; margin: 0;">
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
                const jarra = document.getElementById('edit_jarra').value;
                const observacion = document.getElementById('edit_obs').value;
                const inicio = document.getElementById('edit_inicio').value;
                const termino = document.getElementById('edit_termino').value;

                if (!jarra || !observacion || !inicio || !termino) {
                    Swal.showValidationMessage('Todos los campos son obligatorios');
                    return false;
                }

                const tiempo = calcularTiempoEmpleado(inicio, termino);
                return { jarra, observacion, inicio, termino, tiempo };
            }
        }).then((result) => {
            if (result.isConfirmed) {
                const { jarra, observacion, inicio, termino, tiempo } = result.value;
                datosEnsayos[tipoActual][ensayoActual].jarras[rowNum - 1] = { jarra, observacion, inicio, termino, tiempo };
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
                        <input type="number" id="edit_inicio_amb" class="swal2-input" step="0.1" value="${dataActual.inicio_amb}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Inicio - Pulpa (°C):</label>
                        <input type="number" id="edit_inicio_pul" class="swal2-input" step="0.1" value="${dataActual.inicio_pul}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Término - Ambiente (°C):</label>
                        <input type="number" id="edit_termino_amb" class="swal2-input" step="0.1" value="${dataActual.termino_amb}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Término - Pulpa (°C):</label>
                        <input type="number" id="edit_termino_pul" class="swal2-input" step="0.1" value="${dataActual.termino_pul}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Llegada - Ambiente (°C):</label>
                        <input type="number" id="edit_llegada_amb" class="swal2-input" step="0.1" value="${dataActual.llegada_amb}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Llegada - Pulpa (°C):</label>
                        <input type="number" id="edit_llegada_pul" class="swal2-input" step="0.1" value="${dataActual.llegada_pul}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Despacho - Ambiente (°C):</label>
                        <input type="number" id="edit_despacho_amb" class="swal2-input" step="0.1" value="${dataActual.despacho_amb}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Despacho - Pulpa (°C):</label>
                        <input type="number" id="edit_despacho_pul" class="swal2-input" step="0.1" value="${dataActual.despacho_pul}" style="width: 90%; margin: 0;">
                    </div>
                </div>
            `,
            confirmButtonText: 'Guardar',
            confirmButtonColor: '#2f7cc0',
            showCancelButton: true,
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                return {
                    inicio_amb: document.getElementById('edit_inicio_amb').value,
                    inicio_pul: document.getElementById('edit_inicio_pul').value,
                    termino_amb: document.getElementById('edit_termino_amb').value,
                    termino_pul: document.getElementById('edit_termino_pul').value,
                    llegada_amb: document.getElementById('edit_llegada_amb').value,
                    llegada_pul: document.getElementById('edit_llegada_pul').value,
                    despacho_amb: document.getElementById('edit_despacho_amb').value,
                    despacho_pul: document.getElementById('edit_despacho_pul').value
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
                return {
                    inicio: document.getElementById('edit_inicio').value,
                    perdida: document.getElementById('edit_perdida').value,
                    termino: document.getElementById('edit_termino').value,
                    llegada: document.getElementById('edit_llegada').value,
                    despacho: document.getElementById('edit_despacho').value
                };
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
                        <input type="number" id="edit_inicio" class="swal2-input" step="0.1" value="${dataActual.inicio}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Término (%):</label>
                        <input type="number" id="edit_termino" class="swal2-input" step="0.1" value="${dataActual.termino}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Llegada (%):</label>
                        <input type="number" id="edit_llegada" class="swal2-input" step="0.1" value="${dataActual.llegada}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Despacho (%):</label>
                        <input type="number" id="edit_despacho" class="swal2-input" step="0.1" value="${dataActual.despacho}" style="width: 90%; margin: 0;">
                    </div>
                </div>
            `,
            confirmButtonText: 'Guardar',
            confirmButtonColor: '#2f7cc0',
            showCancelButton: true,
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                return {
                    inicio: document.getElementById('edit_inicio').value,
                    termino: document.getElementById('edit_termino').value,
                    llegada: document.getElementById('edit_llegada').value,
                    despacho: document.getElementById('edit_despacho').value
                };
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
    // EDITAR FILA - TEMP AMBIENTE
    // ========================================
    function editarFilaTempAmbiente(clamNum, dataActual) {
        Swal.fire({
            title: `Editar Temp. Ambiente #${clamNum}`,
            html: `
                <div style="display: flex; flex-direction: column; gap: 15px;">
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Inicio (°C):</label>
                        <input type="number" id="edit_inicio" class="swal2-input" step="0.1" value="${dataActual.inicio}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Término (°C):</label>
                        <input type="number" id="edit_termino" class="swal2-input" step="0.1" value="${dataActual.termino}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Llegada (°C):</label>
                        <input type="number" id="edit_llegada" class="swal2-input" step="0.1" value="${dataActual.llegada}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Despacho (°C):</label>
                        <input type="number" id="edit_despacho" class="swal2-input" step="0.1" value="${dataActual.despacho}" style="width: 90%; margin: 0;">
                    </div>
                </div>
            `,
            confirmButtonText: 'Guardar',
            confirmButtonColor: '#2f7cc0',
            showCancelButton: true,
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                return {
                    inicio: document.getElementById('edit_inicio').value,
                    termino: document.getElementById('edit_termino').value,
                    llegada: document.getElementById('edit_llegada').value,
                    despacho: document.getElementById('edit_despacho').value
                };
            }
        }).then((result) => {
            if (result.isConfirmed) {
                datosEnsayos[tipoActual][ensayoActual].tempambiente[clamNum - 1] = result.value;
                restaurarDatosEnsayo(tipoActual, ensayoActual);
                
                Swal.fire({
                    title: 'Actualizado',
                    text: 'Temperatura actualizada correctamente',
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
                        <input type="number" id="edit_inicio" class="swal2-input" step="0.001" value="${dataActual.inicio}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Término (kPa):</label>
                        <input type="number" id="edit_termino" class="swal2-input" step="0.001" value="${dataActual.termino}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Llegada (kPa):</label>
                        <input type="number" id="edit_llegada" class="swal2-input" step="0.001" value="${dataActual.llegada}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Despacho (kPa):</label>
                        <input type="number" id="edit_despacho" class="swal2-input" step="0.001" value="${dataActual.despacho}" style="width: 90%; margin: 0;">
                    </div>
                </div>
            `,
            confirmButtonText: 'Guardar',
            confirmButtonColor: '#2f7cc0',
            showCancelButton: true,
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                return {
                    inicio: document.getElementById('edit_inicio').value,
                    termino: document.getElementById('edit_termino').value,
                    llegada: document.getElementById('edit_llegada').value,
                    despacho: document.getElementById('edit_despacho').value
                };
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
                        <input type="number" id="edit_inicio" class="swal2-input" step="0.001" value="${dataActual.inicio}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Término (kPa):</label>
                        <input type="number" id="edit_termino" class="swal2-input" step="0.001" value="${dataActual.termino}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Llegada (kPa):</label>
                        <input type="number" id="edit_llegada" class="swal2-input" step="0.001" value="${dataActual.llegada}" style="width: 90%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; text-align: left; margin-bottom: 5px;">Despacho (kPa):</label>
                        <input type="number" id="edit_despacho" class="swal2-input" step="0.001" value="${dataActual.despacho}" style="width: 90%; margin: 0;">
                    </div>
                </div>
            `,
            confirmButtonText: 'Guardar',
            confirmButtonColor: '#2f7cc0',
            showCancelButton: true,
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                return {
                    inicio: document.getElementById('edit_inicio').value,
                    termino: document.getElementById('edit_termino').value,
                    llegada: document.getElementById('edit_llegada').value,
                    despacho: document.getElementById('edit_despacho').value
                };
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
                        <textarea id="edit_obs" class="swal2-input" rows="3" style="width: 90%; margin: 0; height: 80px;">${dataActual.observacion}</textarea>
                    </div>
                </div>
            `,
            confirmButtonText: 'Guardar',
            confirmButtonColor: '#2f7cc0',
            showCancelButton: true,
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const observacion = document.getElementById('edit_obs').value;

                if (!observacion) {
                    Swal.showValidationMessage('La observación es obligatoria');
                    return false;
                }

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
    // REPLICAR FILA
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

        Swal.fire({
            title: 'Replicado',
            text: 'Registro replicado correctamente',
            icon: 'success',
            timer: 1500,
            showConfirmButton: false
        });
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
    const inputInicio = document.getElementById('j_hora_inicio');
    const inputTermino = document.getElementById('j_hora_termino');
    const spanTiempo = document.getElementById('j_tiempo_empleado');

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
    // AÑADIR PESOS (VISUAL)
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
            
            const jarra = document.getElementById('v_jarra').value;
            const p1 = document.getElementById('v_peso1').value;
            const p2 = document.getElementById('v_peso2').value;
            const llegada = document.getElementById('v_llegada_acopio').value;
            const despacho = document.getElementById('v_despacho_acopio').value;

            if (jarra && p1 && p2 && llegada && despacho) {
                const tbody = document.getElementById('tbody-visual');
                const rowData = { jarra, p1, p2, llegada, despacho };
                
                datosEnsayos.visual[ensayoActual].visual.push(rowData);
                const clamNum = datosEnsayos.visual[ensayoActual].visual.length;
                
                agregarFilaVisual(rowData, tbody, clamNum);
                actualizarContador('next_clam_visual', clamNum);

                document.getElementById('v_jarra').value = '';
                document.getElementById('v_peso1').value = '';
                document.getElementById('v_peso2').value = '';
                document.getElementById('v_llegada_acopio').value = '';
                document.getElementById('v_despacho_acopio').value = '';
                document.getElementById('v_jarra').focus();
            } else {
                Swal.fire({ title: 'Atención', text: 'Todos los campos son obligatorios', icon: 'warning' });
            }
        });
    }

    // ========================================
    // AÑADIR JARRAS
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

            // Validar que existan pesos primero
            if (datosEnsayos.visual[ensayoActual].visual.length === 0) {
                Swal.fire({
                    title: 'Atención',
                    text: 'Debes agregar los pesos (Visual) primero para tener en cuenta los N° Jarra',
                    icon: 'warning',
                    confirmButtonColor: '#2f7cc0'
                });
                return;
            }
            
            const jarra = document.getElementById('j_num_jarra').value;
            const observacion = document.getElementById('j_observacion').value;
            const inicio = document.getElementById('j_hora_inicio').value;
            const termino = document.getElementById('j_hora_termino').value;

            if (jarra && observacion && inicio && termino) {
                const tiempo = calcularTiempoEmpleado(inicio, termino);
                const tbody = document.getElementById('tbody-jarras');
                const rowData = { jarra, observacion, inicio, termino, tiempo };
                
                datosEnsayos.visual[ensayoActual].jarras.push(rowData);
                const rowNum = datosEnsayos.visual[ensayoActual].jarras.length;
                
                agregarFilaJarras(rowData, tbody, rowNum);
                actualizarContador('next_row_jarras', rowNum);

                document.getElementById('j_num_jarra').value = '';
                document.getElementById('j_observacion').value = '';
                document.getElementById('j_hora_inicio').value = '';
                document.getElementById('j_hora_termino').value = '';
                document.getElementById('j_tiempo_empleado').textContent = "0'";
                document.getElementById('j_num_jarra').focus();
            } else {
                Swal.fire({ title: 'Atención', text: 'Todos los campos son obligatorios', icon: 'warning' });
            }
        });
    }

    // ========================================
    // AÑADIR TEMPERATURAS
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
            
            const inicio_amb = document.getElementById('temp_inicio_amb').value;
            const inicio_pul = document.getElementById('temp_inicio_pul').value;
            const termino_amb = document.getElementById('temp_termino_amb').value;
            const termino_pul = document.getElementById('temp_termino_pul').value;
            const llegada_amb = document.getElementById('temp_llegada_amb').value;
            const llegada_pul = document.getElementById('temp_llegada_pul').value;
            const despacho_amb = document.getElementById('temp_despacho_amb').value;
            const despacho_pul = document.getElementById('temp_despacho_pul').value;

            if (inicio_amb && inicio_pul && termino_amb && termino_pul && llegada_amb && llegada_pul && despacho_amb && despacho_pul) {
                const tbody = document.getElementById('tbody-temperaturas');
                const rowData = { inicio_amb, inicio_pul, termino_amb, termino_pul, llegada_amb, llegada_pul, despacho_amb, despacho_pul };
                
                datosEnsayos.visual[ensayoActual].temperaturas.push(rowData);
                const clamNum = datosEnsayos.visual[ensayoActual].temperaturas.length;
                
                agregarFilaTemperaturas(rowData, tbody, clamNum);
                actualizarContador('next_clam_temp', clamNum);

                document.getElementById('temp_inicio_amb').value = '';
                document.getElementById('temp_inicio_pul').value = '';
                document.getElementById('temp_termino_amb').value = '';
                document.getElementById('temp_termino_pul').value = '';
                document.getElementById('temp_llegada_amb').value = '';
                document.getElementById('temp_llegada_pul').value = '';
                document.getElementById('temp_despacho_amb').value = '';
                document.getElementById('temp_despacho_pul').value = '';
                document.getElementById('temp_inicio_amb').focus();
            } else {
                Swal.fire({ title: 'Atención', text: 'Todos los campos son obligatorios', icon: 'warning' });
            }
        });
    }

    // ========================================
    // AÑADIR TIEMPOS
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
            
            const inicio = document.getElementById('t_inicio_cosecha').value;
            const perdida = document.getElementById('t_perdida_peso').value;
            const termino = document.getElementById('t_termino_cosecha').value;
            const llegada = document.getElementById('t_llegada_acopio').value;
            const despacho = document.getElementById('t_despacho_acopio').value;

            if (inicio || perdida || termino || llegada || despacho) {
                const tbody = document.getElementById('tbody-tiempos');
                const rowData = { inicio, perdida, termino, llegada, despacho };
                
                datosEnsayos.visual[ensayoActual].tiempos.push(rowData);
                const clamNum = datosEnsayos.visual[ensayoActual].tiempos.length;
                
                agregarFilaTiempos(rowData, tbody, clamNum);
                actualizarContador('next_clam_tiempos', clamNum);

                document.getElementById('t_inicio_cosecha').value = '';
                document.getElementById('t_perdida_peso').value = '';
                document.getElementById('t_termino_cosecha').value = '';
                document.getElementById('t_llegada_acopio').value = '';
                document.getElementById('t_despacho_acopio').value = '';
                document.getElementById('t_inicio_cosecha').focus();
            } else {
                Swal.fire({ title: 'Atención', text: 'Debes ingresar al menos un tiempo', icon: 'warning' });
            }
        });
    }

    // ========================================
    // AÑADIR HUMEDAD
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
            
            const inicio = document.getElementById('h_inicio').value;
            const termino = document.getElementById('h_termino').value;
            const llegada = document.getElementById('h_llegada').value;
            const despacho = document.getElementById('h_despacho').value;

            if (inicio && termino && llegada && despacho) {
                const tbody = document.getElementById('tbody-humedad');
                const rowData = { inicio, termino, llegada, despacho };
                
                datosEnsayos.visual[ensayoActual].humedad.push(rowData);
                const clamNum = datosEnsayos.visual[ensayoActual].humedad.length;
                
                agregarFilaHumedad(rowData, tbody, clamNum);
                actualizarContador('next_clam_humedad', clamNum);

                document.getElementById('h_inicio').value = '';
                document.getElementById('h_termino').value = '';
                document.getElementById('h_llegada').value = '';
                document.getElementById('h_despacho').value = '';
                document.getElementById('h_inicio').focus();
            } else {
                Swal.fire({ title: 'Atención', text: 'Todos los campos son obligatorios', icon: 'warning' });
            }
        });
    }

    // ========================================
    // AÑADIR TEMP AMBIENTE
    // ========================================
    const btnAddTempAmb = document.getElementById('btn-add-temp-amb');
    if (btnAddTempAmb) {
        btnAddTempAmb.addEventListener('click', () => {
            if (!ensayoActual) {
                Swal.fire({ 
                    title: 'Atención', 
                    text: 'Primero selecciona un Rótulo de Muestra (Ensayo)', 
                    icon: 'warning' 
                });
                return;
            }
            
            const inicio = document.getElementById('ta_inicio').value;
            const termino = document.getElementById('ta_termino').value;
            const llegada = document.getElementById('ta_llegada').value;
            const despacho = document.getElementById('ta_despacho').value;

            if (inicio && termino && llegada && despacho) {
                const tbody = document.getElementById('tbody-temp-ambiente');
                const rowData = { inicio, termino, llegada, despacho };
                
                datosEnsayos.visual[ensayoActual].tempambiente.push(rowData);
                const clamNum = datosEnsayos.visual[ensayoActual].tempambiente.length;
                
                agregarFilaTempAmbiente(rowData, tbody, clamNum);
                actualizarContador('next_clam_temp_amb', clamNum);

                document.getElementById('ta_inicio').value = '';
                document.getElementById('ta_termino').value = '';
                document.getElementById('ta_llegada').value = '';
                document.getElementById('ta_despacho').value = '';
                document.getElementById('ta_inicio').focus();
            } else {
                Swal.fire({ title: 'Atención', text: 'Todos los campos son obligatorios', icon: 'warning' });
            }
        });
    }

    // ========================================
    // AÑADIR PRESIÓN AMBIENTE
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
            
            const inicio = document.getElementById('pv_inicio').value;
            const termino = document.getElementById('pv_termino').value;
            const llegada = document.getElementById('pv_llegada').value;
            const despacho = document.getElementById('pv_despacho').value;

            if (inicio && termino && llegada && despacho) {
                const tbody = document.getElementById('tbody-presion');
                const rowData = { inicio, termino, llegada, despacho };
                
                datosEnsayos.visual[ensayoActual].presionambiente.push(rowData);
                const clamNum = datosEnsayos.visual[ensayoActual].presionambiente.length;
                
                agregarFilaPresionAmbiente(rowData, tbody, clamNum);
                actualizarContador('next_clam_presion', clamNum);

                document.getElementById('pv_inicio').value = '';
                document.getElementById('pv_termino').value = '';
                document.getElementById('pv_llegada').value = '';
                document.getElementById('pv_despacho').value = '';
                document.getElementById('pv_inicio').focus();
            } else {
                Swal.fire({ title: 'Atención', text: 'Todos los campos son obligatorios', icon: 'warning' });
            }
        });
    }

    // ========================================
    // AÑADIR PRESIÓN FRUTA
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
            
            const inicio = document.getElementById('pvf_inicio').value;
            const termino = document.getElementById('pvf_termino').value;
            const llegada = document.getElementById('pvf_llegada').value;
            const despacho = document.getElementById('pvf_despacho').value;

            if (inicio && termino && llegada && despacho) {
                const tbody = document.getElementById('tbody-presion-fruta');
                const rowData = { inicio, termino, llegada, despacho };
                
                datosEnsayos.visual[ensayoActual].presionfruta.push(rowData);
                const clamNum = datosEnsayos.visual[ensayoActual].presionfruta.length;
                
                agregarFilaPresionFruta(rowData, tbody, clamNum);
                actualizarContador('next_clam_presion_fruta', clamNum);

                document.getElementById('pvf_inicio').value = '';
                document.getElementById('pvf_termino').value = '';
                document.getElementById('pvf_llegada').value = '';
                document.getElementById('pvf_despacho').value = '';
                document.getElementById('pvf_inicio').focus();
            } else {
                Swal.fire({ title: 'Atención', text: 'Todos los campos son obligatorios', icon: 'warning' });
            }
        });
    }

    // ========================================
    // AÑADIR OBSERVACIÓN
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
            
            const observacion = document.getElementById('v_observacion_texto').value;

            if (observacion) {
                const tbody = document.getElementById('tbody-observacion');
                const rowData = { observacion };
                
                datosEnsayos.visual[ensayoActual].observacion.push(rowData);
                const clamNum = datosEnsayos.visual[ensayoActual].observacion.length;
                
                agregarFilaObservacion(rowData, tbody, clamNum);
                actualizarContador('next_clam_obs', clamNum);

                document.getElementById('v_observacion_texto').value = '';
                document.getElementById('v_observacion_texto').focus();
            } else {
                Swal.fire({ title: 'Atención', text: 'Debe ingresar la observación', icon: 'warning' });
            }
        });
    }

    // ========================================
    // 8. GUARDADO FINAL
    // ========================================
    const btnGuardarGeneral = document.getElementById('btn-guardar-registro');

    if (btnGuardarGeneral) {
        btnGuardarGeneral.addEventListener('click', () => {
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

            // Validar consistencia de datos
            for (let numEnsayo in datosDelTipo) {
                const ensayo = datosDelTipo[numEnsayo];
                
                if (ensayo.visual && ensayo.visual.length > 0) {
                    const totalVisual = ensayo.visual.length;
                    
                    const secciones = ['temperaturas', 'tiempos', 'humedad', 'tempambiente', 'presionambiente', 'presionfruta', 'observacion'];
                    
                    for (let seccion of secciones) {
                        if (ensayo[seccion] && ensayo[seccion].length > 0 && ensayo[seccion].length !== totalVisual) {
                            Swal.fire({
                                title: 'Inconsistencia de Datos',
                                text: `El Ensayo ${numEnsayo} tiene ${totalVisual} registros en Visual, pero ${ensayo[seccion].length} en ${seccion}. Todos deben tener la misma cantidad.`,
                                icon: 'error',
                                confirmButtonColor: '#d33'
                            });
                            return;
                        }
                    }
                }
            }

            // Construir array de ensayos con datos
            const ensayosConDatos = [];
            
            for (let numEnsayo in datosDelTipo) {
                const ensayo = datosDelTipo[numEnsayo];
                
                if (ensayo.visual && ensayo.visual.length > 0) {
                    
                    const registrosCombinados = ensayo.visual.map((visual, index) => {
                        
                        const jarraCorrespondiente = ensayo.jarras ? ensayo.jarras.find(j => j.jarra === visual.jarra) : null;
                        const tempCorrespondiente = ensayo.temperaturas && ensayo.temperaturas[index] ? ensayo.temperaturas[index] : null;
                        const tiempoCorrespondiente = ensayo.tiempos && ensayo.tiempos[index] ? ensayo.tiempos[index] : null;
                        const humedadCorrespondiente = ensayo.humedad && ensayo.humedad[index] ? ensayo.humedad[index] : null;
                        const tempAmbCorrespondiente = ensayo.tempambiente && ensayo.tempambiente[index] ? ensayo.tempambiente[index] : null;
                        const presionAmbCorrespondiente = ensayo.presionambiente && ensayo.presionambiente[index] ? ensayo.presionambiente[index] : null;
                        const presionFrutaCorrespondiente = ensayo.presionfruta && ensayo.presionfruta[index] ? ensayo.presionfruta[index] : null;
                        const obsCorrespondiente = ensayo.observacion && ensayo.observacion[index] ? ensayo.observacion[index] : null;
                        
                        return {
                            clamshell_numero: index + 1,
                            jarra: {
                                numero: parseInt(visual.jarra),
                                peso_bruto: {
                                    p1: parseFloat(visual.p1),
                                    p2: parseFloat(visual.p2),
                                    llegada_acopio: parseFloat(visual.llegada),
                                    despacho_acopio: parseFloat(visual.despacho)
                                },
                                tiempo_llenado: jarraCorrespondiente ? {
                                    observacion: jarraCorrespondiente.observacion,
                                    hora_inicio: jarraCorrespondiente.inicio,
                                    hora_termino: jarraCorrespondiente.termino,
                                    tiempo_empleado: jarraCorrespondiente.tiempo
                                } : null
                            },
                            temperatura_muestra: tempCorrespondiente ? {
                                inicio: {
                                    ambiente: parseFloat(tempCorrespondiente.inicio_amb),
                                    pulpa: parseFloat(tempCorrespondiente.inicio_pul)
                                },
                                termino: {
                                    ambiente: parseFloat(tempCorrespondiente.termino_amb),
                                    pulpa: parseFloat(tempCorrespondiente.termino_pul)
                                },
                                llegada_acopio: {
                                    ambiente: parseFloat(tempCorrespondiente.llegada_amb),
                                    pulpa: parseFloat(tempCorrespondiente.llegada_pul)
                                },
                                despacho_acopio: {
                                    ambiente: parseFloat(tempCorrespondiente.despacho_amb),
                                    pulpa: parseFloat(tempCorrespondiente.despacho_pul)
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
                                inicio: parseFloat(humedadCorrespondiente.inicio),
                                termino: parseFloat(humedadCorrespondiente.termino),
                                llegada_acopio: parseFloat(humedadCorrespondiente.llegada),
                                despacho_acopio: parseFloat(humedadCorrespondiente.despacho)
                            } : null,
                            temperatura_ambiente: tempAmbCorrespondiente ? {
                                inicio: parseFloat(tempAmbCorrespondiente.inicio),
                                termino: parseFloat(tempAmbCorrespondiente.termino),
                                llegada_acopio: parseFloat(tempAmbCorrespondiente.llegada),
                                despacho_acopio: parseFloat(tempAmbCorrespondiente.despacho)
                            } : null,
                            presion_vapor_ambiente: presionAmbCorrespondiente ? {
                                inicio: parseFloat(presionAmbCorrespondiente.inicio),
                                termino: parseFloat(presionAmbCorrespondiente.termino),
                                llegada_acopio: parseFloat(presionAmbCorrespondiente.llegada),
                                despacho_acopio: parseFloat(presionAmbCorrespondiente.despacho)
                            } : null,
                            presion_vapor_fruta: presionFrutaCorrespondiente ? {
                                inicio: parseFloat(presionFrutaCorrespondiente.inicio),
                                termino: parseFloat(presionFrutaCorrespondiente.termino),
                                llegada_acopio: parseFloat(presionFrutaCorrespondiente.llegada),
                                despacho_acopio: parseFloat(presionFrutaCorrespondiente.despacho)
                            } : null,
                            observacion: obsCorrespondiente ? obsCorrespondiente.observacion : null
                        };
                    });
                    
                    ensayosConDatos.push({
                        ensayo_numero: parseInt(numEnsayo),
                        ensayo_nombre: `Ensayo ${numEnsayo}`,
                        registros: registrosCombinados,
                        total_registros: registrosCombinados.length,
                        jarras_unicas: ensayo.jarras ? ensayo.jarras.length : 0
                    });
                }
            }
            
            const payload = {
                metadata: {
                    fecha: document.getElementById('reg_fecha').value,
                    responsable: document.getElementById('reg_responsable').value,
                    guia_remision: document.getElementById('reg_guia_remision').value,
                    variedad: document.getElementById('reg_variedad').value,
                    placa_vehiculo: document.getElementById('reg_placa').value,
                    hora_inicio: document.getElementById('reg_hora_inicio').value,
                    dias_precosecha: document.getElementById('reg_dias_precosecha').value || null,
                    tipo_medicion: tipoMedicion
                },
                trazabilidad: {
                    etapa: document.getElementById('reg_traz_etapa').value,
                    campo: document.getElementById('reg_traz_campo').value,
                    libre: document.getElementById('reg_traz_libre').value || null
                },
                ensayos: ensayosConDatos,
                resumen: {
                    total_ensayos: ensayosConDatos.length,
                    total_registros: ensayosConDatos.reduce((sum, e) => sum + e.total_registros, 0),
                    total_jarras_unicas: ensayosConDatos.reduce((sum, e) => sum + e.jarras_unicas, 0)
                }
            };

            console.log("═══════════════════════════════════════");
            console.log("📦 JSON FINAL ORDENADO PARA BACKEND:");
            console.log("═══════════════════════════════════════");
            console.log(JSON.stringify(payload, null, 2));
            console.log("═══════════════════════════════════════");
            
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