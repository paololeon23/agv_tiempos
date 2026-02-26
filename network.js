// network.js - Blindaje de Datos para MTTP Arándano
export const STORAGE_KEY = "tiempos_agro_seguro_v1";
const API_URL = "https://script.google.com/macros/s/AKfycbyBCmkCN85Y_35jBxHnUyFJ_myHi6Khgoyh0dKq1Zqup_oNtWfdnVMnlEQssXJYotSF/exec";

let isSyncing = false;
let retryTimeoutId = null;

// Actualiza el Card de Conexión y el contador de pendientes; si hay señal, intenta sincronizar
export function updateUI() {
    const items = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    const pendingCount = items.filter(i => i.status === 'pendiente').length;
    const countText = document.getElementById("pending-count");
    const statusText = document.getElementById("status-text");
    const statusCard = document.getElementById("network-status-container");

    if (countText) countText.textContent = `Pendientes: ${pendingCount}`;

    if (navigator.onLine) {
        if (statusText) statusText.textContent = "En línea";
        if (statusCard) { statusCard.className = "status-card online"; }
        sync();
        programarReintentoSiHayPendientes();
    } else {
        if (statusText) statusText.textContent = "Sin conexión";
        if (statusCard) { statusCard.className = "status-card offline"; }
        cancelarReintentos();
    }
    try {
        window.dispatchEvent(new CustomEvent('tiemposStorageUpdated'));
    } catch (e) {}
}

// Si hay pendientes y estamos online, reintentar en 12 s por si la conexión falló (ERR_CONNECTION_RESET, etc.)
function programarReintentoSiHayPendientes() {
    cancelarReintentos();
    const items = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    const pending = items.filter(i => i.status === 'pendiente').length;
    if (pending === 0 || !navigator.onLine) return;
    retryTimeoutId = setTimeout(() => {
        if (navigator.onLine) updateUI();
    }, 12000);
}

function cancelarReintentos() {
    if (retryTimeoutId) {
        clearTimeout(retryTimeoutId);
        retryTimeoutId = null;
    }
}

// Guarda en LocalStorage. Evita cola duplicada: si ya hay un pendiente con las mismas filas, no añade otro.
// Retorna el uid del registro guardado o null si no se guardó (duplicado).
export const saveLocal = (data) => {
    const current = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    const rowsStr = JSON.stringify((data.rows || []).map(r => r.slice(0, 50)));
    const yaHayIgual = current.some(it => it.status !== 'subido' && JSON.stringify((it.rows || []).map(r => r.slice(0, 50))) === rowsStr);
    if (yaHayIgual) {
        return null;
    }
    const dataConId = {
        ...data,
        uid: 'REG-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
        timestamp: new Date().toLocaleString(),
        status: 'pendiente'
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...current, dataConId]));
    updateUI();
    return dataConId.uid;
};

// Enviar a Google Apps Script (mode no-cors evita CORS)
async function sendToCloud(d) {
    const numRows = (d && d.rows) ? d.rows.length : 0;
    console.log('[SYNC] Enviando a la nube:', numRows, 'filas. uid:', d.uid);
    console.log('[SYNC] Resumen por fila:', (d.rows || []).map((r, i) => ({ i: i + 1, fecha: r[0], ensayo: r[12], n_clamshell: r[14], n_jarra: r[15] })));
    await fetch(API_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(d)
    });
}

/** POST Packing: envía mode 'packing'. Con no-cors no se puede leer la respuesta; el backend escribe en la primera hoja. */
export async function postPacking(payload) {
    await fetch(API_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "packing", ...payload })
    });
}

// Mensaje estándar cuando un registro no se sube por duplicado
const RECHAZO_DUPLICADO_MSG = "No se subió porque ya estaba registrado este ensayo para esta fecha.";

// Sincronización: un registro a la vez. Antes de enviar, comprueba por fila si ya existe (fecha+ensayo); rechazados se marcan y no se reenvían.
async function sync() {
    if (isSyncing || !navigator.onLine) return;

    const items = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    const pendingItems = items.filter(i => i.status === 'pendiente');
    if (pendingItems.length === 0) return;

    isSyncing = true;
    const queue = [...pendingItems];

    for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        const rows = item.rows || [];
        if (rows.length === 0) continue;

        const rowsToSend = [];
        const rowsRejected = [];
        for (const row of rows) {
            const fecha = row[0];
            const ensayoNum = row[12];
            if (fecha == null || String(fecha).trim() === '') {
                rowsToSend.push(row);
                continue;
            }
            try {
                const { existe } = await existeRegistroFechaEnsayo(String(fecha).trim(), ensayoNum);
                if (existe) rowsRejected.push(row);
                else rowsToSend.push(row);
            } catch (_) {
                rowsToSend.push(row);
            }
        }

        try {
            if (rowsRejected.length === rows.length) {
                // Todo duplicado: marcar ítem como rechazado (una “entrada” por fila para que el historial muestre cada ensayo)
                let currentItems = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
                currentItems = currentItems.filter(it => it.uid !== item.uid);
                rowsRejected.forEach(row => {
                    currentItems.push({
                        uid: 'REG-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
                        timestamp: item.timestamp || new Date().toLocaleString(),
                        rows: [row],
                        status: 'rechazado_duplicado',
                        rechazoMotivo: RECHAZO_DUPLICADO_MSG
                    });
                });
                localStorage.setItem(STORAGE_KEY, JSON.stringify(currentItems));
                updateUI();
                await new Promise(r => setTimeout(r, 800));
                continue;
            }

            if (rowsRejected.length > 0 && rowsToSend.length > 0) {
                await sendToCloud({ ...item, rows: rowsToSend });
                let currentItems = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
                currentItems = currentItems.filter(it => it.uid !== item.uid);
                const horaSubida = new Date().toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
                currentItems.push({ ...item, rows: rowsToSend, status: 'subido', subidoAt: horaSubida });
                rowsRejected.forEach(row => {
                    currentItems.push({
                        uid: 'REG-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
                        timestamp: item.timestamp || new Date().toLocaleString(),
                        rows: [row],
                        status: 'rechazado_duplicado',
                        rechazoMotivo: RECHAZO_DUPLICADO_MSG
                    });
                });
                localStorage.setItem(STORAGE_KEY, JSON.stringify(currentItems));
                updateUI();
                await new Promise(r => setTimeout(r, 2500));
                continue;
            }

            await sendToCloud(item);
            let currentItems = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
            const horaSubida = new Date().toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
            currentItems = currentItems.map(it =>
                it.uid === item.uid ? { ...it, status: 'subido', subidoAt: horaSubida } : it
            );
            localStorage.setItem(STORAGE_KEY, JSON.stringify(currentItems));
            updateUI();
            await new Promise(r => setTimeout(r, 2500));
        } catch (_e) {
            break;
        }
    }

    isSyncing = false;
}

const MSJ_SIN_CONEXION = "Sin conexión. Conéctate para cargar datos.";
const PACKING_CACHE_KEY = "tiempos_packing_cache_v1";
const LISTADO_REGISTRADOS_KEY = "tiempos_listado_registrados_v1";
const LISTADO_REGISTRADOS_TTL_MS = 2 * 60 * 1000; // 2 min
/** Máximo de entradas (fecha_ensayo) en caché GET para no llenar localStorage y mantener la app ligera. */
const MAX_DATOS_BY_FECHA_ENSAYO = 40;

export function getPackingCache() {
    try {
        const raw = localStorage.getItem(PACKING_CACHE_KEY);
        const base = raw ? JSON.parse(raw) : { fechas: [], ensayosByFecha: {}, lastRow: null };
        if (!base.datosByFechaEnsayo) base.datosByFechaEnsayo = {};
        return base;
    } catch (_) {
        return { fechas: [], ensayosByFecha: {}, lastRow: null, datosByFechaEnsayo: {} };
    }
}

function setPackingCache(partial) {
    try {
        const cache = getPackingCache();
        if (partial.fechas != null) cache.fechas = partial.fechas;
        if (partial.ensayosByFecha != null) cache.ensayosByFecha = { ...cache.ensayosByFecha, ...partial.ensayosByFecha };
        if (partial.lastRow != null) cache.lastRow = partial.lastRow;
        if (partial.datosByFechaEnsayo != null) {
            cache.datosByFechaEnsayo = { ...cache.datosByFechaEnsayo, ...partial.datosByFechaEnsayo };
            var keys = Object.keys(cache.datosByFechaEnsayo);
            if (keys.length > MAX_DATOS_BY_FECHA_ENSAYO) {
                keys.slice(0, keys.length - MAX_DATOS_BY_FECHA_ENSAYO).forEach(function (k) { delete cache.datosByFechaEnsayo[k]; });
            }
        }
        localStorage.setItem(PACKING_CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
        if (e && e.name === 'QuotaExceededError') {
            try {
                var c = getPackingCache();
                c.datosByFechaEnsayo = {};
                localStorage.setItem(PACKING_CACHE_KEY, JSON.stringify(c));
            } catch (_) {}
        }
    }
}

/** GET vía JSONP (evita CORS: carga con <script>, misma URL que POST). */
function fetchGetJsonp(url) {
    return new Promise((resolve, reject) => {
        const name = '__tiemposPacking_' + Date.now();
        const sep = url.indexOf('?') >= 0 ? '&' : '?';
        const scriptUrl = url + sep + 'callback=' + encodeURIComponent(name);

        console.log('[GET Enviando] URL completa:', scriptUrl);
        console.log('[GET Enviando] Parámetros en la URL:', url.replace(API_URL, '').replace(/^\?/, '') || '(ninguno, pide fechas)');

        const cleanup = () => {
            try { if (script.parentNode) script.remove(); } catch (_) {}
            try { delete window[name]; } catch (_) {}
            if (timer) clearTimeout(timer);
        };

        window[name] = (data) => {
            cleanup();
            console.log('[GET Respuesta recibida]', data);
            resolve(data || { ok: false, error: "Respuesta inválida" });
        };

        const timer = setTimeout(() => {
            cleanup();
            console.warn('[GET Timeout] No hubo respuesta en 10 s.');
            reject(new Error(MSJ_SIN_CONEXION));
        }, 10000);

        const script = document.createElement('script');
        script.onerror = () => {
            cleanup();
            console.warn('[GET Error] Falló la carga del script (bloqueado o sin red).');
            reject(new Error(MSJ_SIN_CONEXION));
        };
        script.src = scriptUrl;
        document.head.appendChild(script);
    });
}

/** GET: lista de fechas. Siempre intenta enviar la petición (con parámetros); si falla usa caché. */
export async function getFechasConDatos() {
    console.log('[getFechasConDatos] Enviando: sin params → el servidor debe devolver { ok: true, fechas: ["2026-02-17", ...] }');
    try {
        const out = await fetchGetJsonp(API_URL);
        if (out.ok && Array.isArray(out.fechas)) {
            console.log('[getFechasConDatos] OK. Fechas recibidas:', out.fechas);
            setPackingCache({ fechas: out.fechas });
            return out;
        }
        const cache = getPackingCache();
        if (cache.fechas && cache.fechas.length > 0) {
            console.log('[getFechasConDatos] Usando caché. Fechas:', cache.fechas);
            return { ok: true, fechas: cache.fechas, fromCache: true };
        }
        console.warn('[getFechasConDatos] Sin datos. Error:', out.error);
        return { ok: false, fechas: [], error: out.error || "No se pudieron cargar las fechas." };
    } catch (e) {
        const cache = getPackingCache();
        if (cache.fechas && cache.fechas.length > 0) {
            console.log('[getFechasConDatos] Falló la petición, usando caché.');
            return { ok: true, fechas: cache.fechas, fromCache: true };
        }
        console.warn('[getFechasConDatos] Error:', e && e.message);
        return { ok: false, fechas: [], error: e && e.message ? e.message : MSJ_SIN_CONEXION };
    }
}

/** GET: lista de ensayos para una fecha. Siempre intenta enviar ?fecha=... ; si falla usa caché. */
export async function getEnsayosPorFecha(fecha) {
    console.log('[getEnsayosPorFecha] Enviando: fecha=' + fecha + ' → el servidor debe devolver { ok: true, ensayos: ["Ensayo 1", "Ensayo 2", ...] }');
    try {
        const url = API_URL + "?fecha=" + encodeURIComponent(fecha);
        const out = await fetchGetJsonp(url);
        if (out.ok && Array.isArray(out.ensayos)) {
            console.log('[getEnsayosPorFecha] OK. Ensayos recibidos:', out.ensayos);
            setPackingCache({ ensayosByFecha: { [fecha]: out.ensayos } });
            return out;
        }
        const cache = getPackingCache();
        const cached = cache.ensayosByFecha && cache.ensayosByFecha[fecha];
        if (cached && cached.length > 0) {
            console.log('[getEnsayosPorFecha] Usando caché. Ensayos:', cached);
            return { ok: true, ensayos: cached, fromCache: true };
        }
        console.warn('[getEnsayosPorFecha] Sin datos. Error:', out.error);
        return { ok: false, ensayos: [], error: out.error || "No se pudieron cargar los ensayos." };
    } catch (e) {
        const cache = getPackingCache();
        const cached = cache.ensayosByFecha && cache.ensayosByFecha[fecha];
        if (cached && cached.length > 0) {
            console.log('[getEnsayosPorFecha] Falló la petición, usando caché.');
            return { ok: true, ensayos: cached, fromCache: true };
        }
        console.warn('[getEnsayosPorFecha] Error:', e && e.message);
        return { ok: false, ensayos: [], error: e && e.message ? e.message : MSJ_SIN_CONEXION };
    }
}

/** GET: listado de todos los (fecha, ensayo_numero, ensayo_nombre) registrados en el servidor. Con cache 2 min. */
export async function getListadoRegistrados() {
    try {
        const raw = localStorage.getItem(LISTADO_REGISTRADOS_KEY);
        if (raw) {
            const { registrados, ts } = JSON.parse(raw);
            if (Array.isArray(registrados) && (Date.now() - (ts || 0)) < LISTADO_REGISTRADOS_TTL_MS)
                return { ok: true, registrados, fromCache: true };
        }
        const url = API_URL + "?listado_registrados=1";
        const out = await fetchGetJsonp(url);
        if (out.ok && Array.isArray(out.registrados)) {
            localStorage.setItem(LISTADO_REGISTRADOS_KEY, JSON.stringify({ registrados: out.registrados, ts: Date.now() }));
            return { ok: true, registrados: out.registrados };
        }
        if (raw) {
            const { registrados } = JSON.parse(raw);
            if (Array.isArray(registrados)) return { ok: true, registrados, fromCache: true };
        }
        return { ok: false, registrados: [], error: out.error || "No se pudo cargar el listado." };
    } catch (e) {
        const raw = localStorage.getItem(LISTADO_REGISTRADOS_KEY);
        if (raw) {
            try {
                const { registrados } = JSON.parse(raw);
                if (Array.isArray(registrados)) return { ok: true, registrados, fromCache: true };
            } catch (_) {}
        }
        return { ok: false, registrados: [], error: e && e.message ? e.message : MSJ_SIN_CONEXION };
    }
}

/** GET: comprobar si ya existe un registro para esta fecha + ensayo_numero (evitar duplicados). Devuelve { ok, existe } */
export async function existeRegistroFechaEnsayo(fecha, ensayoNumero) {
    try {
        const url = API_URL + "?existe_registro=1&fecha=" + encodeURIComponent(fecha) + "&ensayo_numero=" + encodeURIComponent(String(ensayoNumero));
        const out = await fetchGetJsonp(url);
        return { ok: out.ok === true, existe: out.existe === true, ensayo_numero: out.ensayo_numero };
    } catch (e) {
        console.warn('[existeRegistroFechaEnsayo] Error:', e && e.message);
        return { ok: false, existe: false };
    }
}

/** Clave de caché por (fecha, ensayo) para no repetir GET al cambiar de ensayo. */
function keyFechaEnsayo(fecha, ensayoNumero) {
    return (fecha || '') + '_' + (ensayoNumero || '');
}

/** GET: fila por fecha y ensayo_numero. Parámetros: ?fecha=...&ensayo_numero=1|2|3|4. Usa caché por (fecha, ensayo) para no hacer GET repetidos. skipCache=true evita usar caché (siempre pide al servidor). */
export async function getDatosPacking(fecha, ensayoNumero, skipCache) {
    const key = keyFechaEnsayo(fecha, ensayoNumero);
    const cache = getPackingCache();
    if (!skipCache && cache.datosByFechaEnsayo && cache.datosByFechaEnsayo[key]) {
        console.log('[getDatosPacking] Caché hit para', key, '(numFilas=', cache.datosByFechaEnsayo[key].numFilas + ')');
        return { ok: true, data: cache.datosByFechaEnsayo[key], fromCache: true };
    }
    if (skipCache) console.log('[getDatosPacking] Sin caché: pidiendo al servidor fecha=' + fecha + ', ensayo_numero=' + ensayoNumero);
    else console.log('[getDatosPacking] Enviando: fecha=' + fecha + ', ensayo_numero=' + ensayoNumero);
    try {
        const url = API_URL + "?fecha=" + encodeURIComponent(fecha) + "&ensayo_numero=" + encodeURIComponent(ensayoNumero);
        const out = await fetchGetJsonp(url);
        if (out.ok && out.data) {
            console.log('[getDatosPacking] OK. Data recibida. numFilas=' + (out.data.numFilas != null ? out.data.numFilas : 'n/a'));
            setPackingCache({
                lastRow: { fecha, ensayo_numero: ensayoNumero, data: out.data },
                datosByFechaEnsayo: { [key]: out.data }
            });
            return out;
        }
        console.warn('[getDatosPacking] Sin datos. Error:', out.error);
        return { ok: false, data: null, error: out.error || "No hay registro." };
    } catch (e) {
        if (cache.lastRow && cache.lastRow.fecha === fecha && String(cache.lastRow.ensayo_numero) === String(ensayoNumero)) {
            console.log('[getDatosPacking] Falló la petición, usando lastRow.');
            return { ok: true, data: cache.lastRow.data, fromCache: true };
        }
        console.warn('[getDatosPacking] Error:', e && e.message);
        return { ok: false, data: null, error: e && e.message ? e.message : MSJ_SIN_CONEXION };
    }
}