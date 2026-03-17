// network.js - Blindaje de Datos para MTTP Arándano
export const STORAGE_KEY = "tiempos_agro_seguro_v1";
const PACKING_QUEUE_KEY = "tiempos_packing_queue_v1";
const API_URL = "https://script.google.com/macros/s/AKfycbwdC1lwuGNT01xfLE_0jI31oXU13rBinYPKwlVfkZwqmIJGqSRuvPnq4-A9b6tHZThN/exec";

/** Máximo de ítems ya procesados (subido/rechazado) a conservar; los más antiguos se borran. Los pendientes siempre se conservan. */
const MAX_REGISTRO_HISTORIAL = 80;
const MAX_PACKING_HISTORIAL = 50;

let isSyncing = false;
let isSyncingPacking = false;
let retryTimeoutId = null;

/** Recorta la cola de registro: mantiene todos los pendientes y solo los últimos MAX_REGISTRO_HISTORIAL ya procesados (subido/rechazado). */
function trimRegistroQueue() {
    try {
        const current = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        const pendiente = current.filter(i => i.status === 'pendiente');
        const otros = current.filter(i => i.status !== 'pendiente');
        const otrosOrdenados = otros.slice().sort((a, b) => (a.subidoAt || a.timestamp || '').localeCompare(b.subidoAt || b.timestamp || ''));
        const otrosRecortados = otrosOrdenados.slice(-MAX_REGISTRO_HISTORIAL);
        const nuevo = [...pendiente, ...otrosRecortados];
        if (nuevo.length < current.length) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(nuevo));
        }
    } catch (_) {}
}

/** Recorta la cola de packing: mantiene todos los pendientes y solo los últimos MAX_PACKING_HISTORIAL ya subidos. Escribe directo a localStorage para no recursar con setPackingQueue. */
function trimPackingQueue() {
    try {
        const queue = getPackingQueue();
        const pendiente = queue.filter(i => i.status === 'pendiente');
        const subidos = queue.filter(i => i.status === 'subido').slice().sort((a, b) => (a.subidoAt || a.timestamp || '').localeCompare(b.subidoAt || b.timestamp || ''));
        const subidosRecortados = subidos.slice(-MAX_PACKING_HISTORIAL);
        const nuevo = [...pendiente, ...subidosRecortados];
        if (nuevo.length < queue.length) {
            localStorage.setItem(PACKING_QUEUE_KEY, JSON.stringify(nuevo));
        }
    } catch (_) {}
}

/** Cola de Packing: guardar para enviar cuando haya conexión. */
export function getPackingQueue() {
    try {
        const raw = localStorage.getItem(PACKING_QUEUE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (_) {
        return [];
    }
}

function setPackingQueue(items) {
    try {
        localStorage.setItem(PACKING_QUEUE_KEY, JSON.stringify(items));
        trimPackingQueue();
    } catch (e) {
        if (e && e.name === 'QuotaExceededError') {
            trimPackingQueue();
            try {
                const q = getPackingQueue();
                localStorage.setItem(PACKING_QUEUE_KEY, JSON.stringify(q));
            } catch (_) {}
            console.warn('[Packing] localStorage lleno');
        }
    }
}

/** Guarda un envío de Packing en cola (fecha, ensayo_numero, fila, hora_recepcion, n_viaje, packingRows). Retorna uid. */
export function savePackingToQueue(payload) {
    const queue = getPackingQueue();
    const item = {
        uid: 'PKG-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
        timestamp: new Date().toLocaleString(),
        status: 'pendiente',
        payload: payload
    };
    queue.push(item);
    setPackingQueue(queue);
    return item.uid;
}

/** Verifica con GET que el packing se haya guardado (data.tienePacking). Igual que registro: solo marcar "subido" cuando esté confirmado. */
async function verificarPackingSubido(fecha, ensayoNumero) {
    if (!fecha || ensayoNumero == null || ensayoNumero === '') return false;
    try {
        const res = await getDatosPacking(String(fecha).trim(), String(ensayoNumero), true);
        return res.ok === true && res.data && res.data.tienePacking === true;
    } catch (_) {
        return false;
    }
}

/** Envía los Packing pendientes cuando hay conexión. Tras POST, verifica con GET (tienePacking) antes de marcar subido; si falla no hace break. */
async function syncPackingQueue() {
    if (isSyncingPacking || !navigator.onLine) return;
    const queue = getPackingQueue().filter(i => i.status === 'pendiente');
    if (queue.length === 0) return;

    isSyncingPacking = true;
    for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        try {
            await postPacking(item.payload);
            const verificado = await verificarPackingSubido(item.payload.fecha, item.payload.ensayo_numero);
            if (!verificado) continue;
            const updated = getPackingQueue().map(it =>
                it.uid === item.uid ? { ...it, status: 'subido', subidoAt: new Date().toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) } : it
            );
            setPackingQueue(updated);
            updateUI();
            await new Promise(r => setTimeout(r, 800));
        } catch (_) {
            // No break: seguir con el siguiente ítem
        }
    }
    isSyncingPacking = false;
}

// Actualiza el Card de Conexión y el contador de pendientes; si hay señal, intenta sincronizar
export function updateUI() {
    trimRegistroQueue();
    trimPackingQueue();
    const items = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    const pendingCount = items.filter(i => i.status === 'pendiente').length;
    const packingQueue = getPackingQueue();
    const packingPending = packingQueue.filter(i => i.status === 'pendiente').length;
    const countText = document.getElementById("pending-count");
    const statusText = document.getElementById("status-text");
    const statusCard = document.getElementById("network-status-container");

    if (countText) {
        if (packingPending > 0) {
            countText.textContent = `Pendientes: ${pendingCount} | Packing: ${packingPending}`;
        } else {
            countText.textContent = `Pendientes: ${pendingCount}`;
        }
    }

    if (navigator.onLine) {
        if (statusText) statusText.textContent = "En línea";
        if (statusCard) { statusCard.className = "status-card online"; }
        sync();
        syncPackingQueue();
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

// Si hay pendientes (registro o packing) y estamos online, reintentar en 12 s por si la conexión falló
function programarReintentoSiHayPendientes() {
    cancelarReintentos();
    const items = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    const pending = items.filter(i => i.status === 'pendiente').length;
    const packingPending = getPackingQueue().filter(i => i.status === 'pendiente').length;
    if ((pending === 0 && packingPending === 0) || !navigator.onLine) return;
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
    const nuevo = [...current, dataConId];
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(nuevo));
    } catch (e) {
        if (e && e.name === 'QuotaExceededError') {
            trimRegistroQueue();
            try {
                const despues = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
                despues.push(dataConId);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(despues));
            } catch (_) {}
        } else {
            throw e;
        }
    }
    trimRegistroQueue();
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

/** Verifica con GET que cada fila (fecha+ensayo) exista en el servidor. Solo marcar "subido" cuando sea true (evita marcar subido si el POST falló por no-cors). */
async function verificarRegistroSubido(rows) {
    if (!rows || rows.length === 0) return true;
    const checks = await Promise.all(rows.map(async (row) => {
        const fecha = row[0];
        const ensayoNum = row[12];
        if (fecha == null || String(fecha).trim() === '') return true;
        try {
            const { existe } = await existeRegistroFechaEnsayo(String(fecha).trim(), ensayoNum);
            return existe === true;
        } catch (_) {
            return false;
        }
    }));
    return checks.every(Boolean);
}

// Sincronización: un registro a la vez. Antes de enviar comprueba por fila si ya existe; después de enviar verifica con GET antes de marcar "subido".
async function sync() {
    if (isSyncing || !navigator.onLine) return;

    const items = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
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
                let currentItems = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
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
                trimRegistroQueue();
                updateUI();
                await new Promise(r => setTimeout(r, 800));
                continue;
            }

            if (rowsRejected.length > 0 && rowsToSend.length > 0) {
                await sendToCloud({ ...item, rows: rowsToSend });
                const verificado = await verificarRegistroSubido(rowsToSend);
                if (!verificado) continue;
                let currentItems = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
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
                trimRegistroQueue();
                updateUI();
                await new Promise(r => setTimeout(r, 2500));
                continue;
            }

            await sendToCloud(item);
            const verificado = await verificarRegistroSubido(rows);
            if (!verificado) continue;
            let currentItems = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            const horaSubida = new Date().toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
            currentItems = currentItems.map(it =>
                it.uid === item.uid ? { ...it, status: 'subido', subidoAt: horaSubida } : it
            );
            localStorage.setItem(STORAGE_KEY, JSON.stringify(currentItems));
            trimRegistroQueue();
            updateUI();
            await new Promise(r => setTimeout(r, 2500));
        } catch (_e) {
            // No break: seguir con el siguiente ítem para no bloquear la cola
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

/** GET: lista de fechas. Con internet intenta servidor y guarda en caché; sin internet devuelve caché al instante. */
export async function getFechasConDatos() {
    if (!navigator.onLine) {
        const cache = getPackingCache();
        if (cache.fechas && cache.fechas.length > 0)
            return { ok: true, fechas: cache.fechas, fromCache: true };
        return { ok: false, fechas: [], error: MSJ_SIN_CONEXION };
    }
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

/** GET: lista de ensayos para una fecha. Con internet intenta servidor y guarda en caché; sin internet devuelve caché al instante. */
export async function getEnsayosPorFecha(fecha) {
    if (!navigator.onLine) {
        const cache = getPackingCache();
        const cached = cache.ensayosByFecha && cache.ensayosByFecha[fecha];
        if (cached && cached.length > 0)
            return { ok: true, ensayos: cached, fromCache: true };
        return { ok: false, ensayos: [], error: MSJ_SIN_CONEXION };
    }
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

/** Rellena la caché de GET (fechas, listado registrados) cuando hay internet. Llamar al cargar la app para tener datos locales al ir offline. */
export async function primeGetCache() {
    if (!navigator.onLine) return;
    try {
        await getFechasConDatos();
    } catch (_) {}
    try {
        await getListadoRegistrados();
    } catch (_) {}
}

/** GET: listado de todos los (fecha, ensayo_numero, ensayo_nombre) registrados en el servidor. Con cache 2 min online; offline siempre usa caché si existe. */
export async function getListadoRegistrados() {
    try {
        const raw = localStorage.getItem(LISTADO_REGISTRADOS_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            const registrados = parsed.registrados;
            const ts = parsed.ts || 0;
            const dentroTTL = (Date.now() - ts) < LISTADO_REGISTRADOS_TTL_MS;
            if (Array.isArray(registrados) && (dentroTTL || !navigator.onLine))
                return { ok: true, registrados, fromCache: true };
        }
        if (!navigator.onLine) {
            if (raw) {
                try {
                    const { registrados } = JSON.parse(raw);
                    if (Array.isArray(registrados)) return { ok: true, registrados, fromCache: true };
                } catch (_) {}
            }
            return { ok: false, registrados: [], error: MSJ_SIN_CONEXION };
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

/** GET: fila por fecha y ensayo_numero. Con internet y skipCache pide servidor; sin internet devuelve caché al instante si existe. */
export async function getDatosPacking(fecha, ensayoNumero, skipCache) {
    const key = keyFechaEnsayo(fecha, ensayoNumero);
    const cache = getPackingCache();
    if (!skipCache && cache.datosByFechaEnsayo && cache.datosByFechaEnsayo[key]) {
        console.log('[getDatosPacking] Caché hit para', key, '(numFilas=', cache.datosByFechaEnsayo[key].numFilas + ')');
        return { ok: true, data: cache.datosByFechaEnsayo[key], fromCache: true };
    }
    if (!navigator.onLine) {
        if (cache.lastRow && cache.lastRow.fecha === fecha && String(cache.lastRow.ensayo_numero) === String(ensayoNumero))
            return { ok: true, data: cache.lastRow.data, fromCache: true };
        return { ok: false, data: null, error: MSJ_SIN_CONEXION };
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