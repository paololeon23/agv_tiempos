// network.js - Blindaje de Datos para MTTP Arándano
export const STORAGE_KEY = "tiempos_agro_seguro_v1";
const PACKING_QUEUE_KEY = "tiempos_packing_queue_v1";
const API_URL = "https://script.google.com/macros/s/AKfycbwdC1lwuGNT01xfLE_0jI31oXU13rBinYPKwlVfkZwqmIJGqSRuvPnq4-A9b6tHZThN/exec";

/** Máximo de ítems ya procesados (subido/rechazado) a conservar; los más antiguos se borran. Los pendientes siempre se conservan. */
const MAX_REGISTRO_HISTORIAL = 80;
const MAX_PACKING_HISTORIAL = 50;
const LATENCIA_PING_INTERVAL_MS = 10000;
const LATENCIA_PING_TIMEOUT_MS = 4500;
const LATENCIA_UMBRAL_VERDE_MS = 700;
const LATENCIA_UMBRAL_AMARILLO_MS = 1600;

let isSyncing = false;
let isSyncingPacking = false;
let retryTimeoutId = null;
let latencyTimerId = null;
let latencyPollInFlight = false;
let lastLatencyState = { level: 'unknown', text: 'Nivel de internet: --', latencyMs: null, online: typeof navigator !== 'undefined' ? navigator.onLine : true };

function publishLatencyState(state) {
    lastLatencyState = state;
    try { window.__tiemposNetQuality = state; } catch (_) {}
    try { window.dispatchEvent(new CustomEvent('tiemposNetQualityUpdated', { detail: state })); } catch (_) {}
}

function aplicarUiLatencia(state) {
    const el = document.getElementById('latency-live');
    const textEl = document.getElementById('latency-live-text');
    if (!el || !textEl) {
        publishLatencyState(state);
        return;
    }
    el.classList.remove('latency-good', 'latency-warn', 'latency-bad', 'latency-unknown');
    if (state.level === 'good') el.classList.add('latency-good');
    else if (state.level === 'warn') el.classList.add('latency-warn');
    else if (state.level === 'bad') el.classList.add('latency-bad');
    else el.classList.add('latency-unknown');
    textEl.textContent = state.text;
    if (state.level === 'bad') el.title = 'Red inestable o lenta. No es recomendable enviar.';
    else if (state.level === 'warn') el.title = 'Red intermedia. Puedes enviar, pero puede tardar.';
    else if (state.level === 'good') el.title = 'Red estable para enviar.';
    else el.title = 'Midiendo latencia...';
    publishLatencyState(state);
}

async function medirLatenciaUnaVez() {
    if (latencyPollInFlight) return;
    latencyPollInFlight = true;
    try {
        if (!navigator.onLine) {
            aplicarUiLatencia({ level: 'bad', text: 'Nivel de internet: Sin conexión', latencyMs: null, online: false });
            return;
        }
        const start = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        let timeoutId = null;
        if (controller) {
            timeoutId = setTimeout(() => {
                try { controller.abort(); } catch (_) {}
            }, LATENCIA_PING_TIMEOUT_MS);
        }
        try {
            await fetch(API_URL + '?ping=1&t=' + Date.now(), {
                method: 'GET',
                mode: 'no-cors',
                cache: 'no-store',
                signal: controller ? controller.signal : undefined
            });
            const end = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            const ms = Math.max(0, Math.round(end - start));
            if (ms <= LATENCIA_UMBRAL_VERDE_MS) {
                aplicarUiLatencia({ level: 'good', text: 'Nivel de internet: Bueno', latencyMs: ms, online: true });
            } else if (ms <= LATENCIA_UMBRAL_AMARILLO_MS) {
                aplicarUiLatencia({ level: 'warn', text: 'Nivel de internet: Intermedio', latencyMs: ms, online: true });
            } else {
                // Online pero lenta: amarillo (rojo solo offline real).
                aplicarUiLatencia({ level: 'warn', text: 'Nivel de internet: Intermedio', latencyMs: ms, online: true });
            }
        } catch (_) {
            // Puede fallar un ping puntual aun con internet; mantener amarillo.
            aplicarUiLatencia({ level: 'warn', text: 'Nivel de internet: Intermedio', latencyMs: null, online: true });
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }
    } finally {
        latencyPollInFlight = false;
    }
}

function ensureLatencyMonitor() {
    if (latencyTimerId) return;
    medirLatenciaUnaVez();
    latencyTimerId = setInterval(medirLatenciaUnaVez, LATENCIA_PING_INTERVAL_MS);
}

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

async function verificarRecepcionC5Subido(fecha, ensayoNumero) {
    if (!fecha || ensayoNumero == null || ensayoNumero === '') return false;
    try {
        const res = await getDatosPacking(String(fecha).trim(), String(ensayoNumero), true);
        return res.ok === true && res.data && res.data.tieneRecepcionC5 === true;
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
            const soloC5 = item.payload && item.payload.mode === 'recepcion-c5';
            if (soloC5) {
                const pl = Object.assign({}, item.payload);
                delete pl.mode;
                await postRecepcionC5(pl);
                const verificado = await verificarRecepcionC5Subido(item.payload.fecha, item.payload.ensayo_numero);
                if (!verificado) continue;
            } else {
                await postPacking(item.payload);
                const verificado = await verificarPackingSubido(item.payload.fecha, item.payload.ensayo_numero);
                if (!verificado) continue;
            }
            const updated = getPackingQueue().map(it =>
                it.uid === item.uid ? { ...it, status: 'subido', subidoAt: new Date().toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) } : it
            );
            setPackingQueue(updated);
            updateUI();
            await new Promise(r => setTimeout(r, 250));
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
    ensureLatencyMonitor();
    medirLatenciaUnaVez();
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
    if (!navigator.onLine) {
        throw new Error('Sin conexión');
    }
    var p = Object.assign({}, payload);
    delete p.mode;
    await fetch(API_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "packing", ...p })
    });
}

/** POST solo Recepción C5 (misma fila fecha+ensayo; no requiere bloque Packing en hoja). Apps Script: mode recepcion-c5 */
export async function postRecepcionC5(payload) {
    if (!navigator.onLine) {
        throw new Error('Sin conexión');
    }
    var p = Object.assign({}, payload);
    delete p.mode;
    await fetch(API_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "recepcion-c5", ...p })
    });
}

// Mensaje estándar cuando un registro no se sube por duplicado
const RECHAZO_DUPLICADO_MSG = "No se subió porque ya estaba registrado este ensayo para esta fecha.";

/** Clave única fecha+ensayo (varias filas del mismo ensayo = un solo GET). */
function claveFechaEnsayoRow(row) {
    const fecha = row[0];
    const ensayoNum = row[12];
    if (fecha == null || String(fecha).trim() === '') return null;
    return String(fecha).trim() + '\u0001' + String(ensayoNum);
}

/** Verifica con GET que cada combinación (fecha+ensayo) distinta exista en el servidor. Varias filas del mismo ensayo → una sola petición. */
async function verificarRegistroSubido(rows) {
    if (!rows || rows.length === 0) return true;
    const keys = [...new Set(rows.map(claveFechaEnsayoRow).filter(Boolean))];
    const porClave = new Map();
    await Promise.all(keys.map(async (key) => {
        const i = key.indexOf('\u0001');
        const fecha = key.slice(0, i);
        const ensayoNum = key.slice(i + 1);
        try {
            const { existe } = await existeRegistroFechaEnsayo(fecha, ensayoNum);
            porClave.set(key, existe === true);
        } catch (_) {
            porClave.set(key, false);
        }
    }));
    return rows.every((row) => {
        const k = claveFechaEnsayoRow(row);
        if (!k) return true;
        return porClave.get(k) === true;
    });
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
        const cacheExiste = new Map();
        for (const row of rows) {
            const fecha = row[0];
            const ensayoNum = row[12];
            if (fecha == null || String(fecha).trim() === '') {
                rowsToSend.push(row);
                continue;
            }
            const key = String(fecha).trim() + '\u0001' + String(ensayoNum);
            try {
                let existe;
                if (cacheExiste.has(key)) existe = cacheExiste.get(key);
                else {
                    const res = await existeRegistroFechaEnsayo(String(fecha).trim(), ensayoNum);
                    existe = res.existe === true;
                    cacheExiste.set(key, existe);
                }
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
                await new Promise(r => setTimeout(r, 250));
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
                await new Promise(r => setTimeout(r, 500));
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
            await new Promise(r => setTimeout(r, 500));
        } catch (_e) {
            // No break: seguir con el siguiente ítem para no bloquear la cola
        }
    }

    isSyncing = false;
}

const MSJ_SIN_CONEXION = "Sin conexión. Conéctate para cargar datos.";
/** GET JSONP: el servidor no respondió a tiempo (no implica falta de internet). */
const MSJ_JSONP_TIMEOUT = "El servidor tardó en responder. Intenta de nuevo en unos segundos.";
const PACKING_CACHE_KEY = "tiempos_packing_cache_v1";
const LISTADO_REGISTRADOS_KEY = "tiempos_listado_registrados_v1";
const LISTADO_REGISTRADOS_TTL_MS = 2 * 60 * 1000; // 2 min
/**
 * Máximo de combinaciones fecha+ensayo con datos completos de packing en caché (localStorage).
 * Si no hay entrada para esa clave → getDatosPacking pide al servidor (no inventa datos).
 * Al superar este número, se va borrando la más antigua (LRU) y entrando la nueva.
 */
const MAX_RECENT_BUSQUEDAS_PACKING = 40;

/**
 * Marca una clave como la más reciente y elimina la más antigua si hay más de MAX_RECENT_BUSQUEDAS_PACKING.
 * @param {object} cache Objeto caché mutado in-place (debe incluir datosByFechaEnsayo y recentSearchKeys).
 */
function touchRecentSearchInMemory(cache, key) {
    if (!key) return;
    if (!cache.recentSearchKeys) cache.recentSearchKeys = [];
    if (!cache.datosByFechaEnsayo) cache.datosByFechaEnsayo = {};
    var arr = cache.recentSearchKeys;
    var i = arr.indexOf(key);
    if (i >= 0) arr.splice(i, 1);
    arr.unshift(key);
    while (arr.length > MAX_RECENT_BUSQUEDAS_PACKING) {
        var ev = arr.pop();
        if (ev && cache.datosByFechaEnsayo[ev]) {
            delete cache.datosByFechaEnsayo[ev];
            console.log('[cache packing] LRU: se eliminó búsqueda antigua (límite ' + MAX_RECENT_BUSQUEDAS_PACKING + '):', ev);
        }
    }
}

export function getPackingCache() {
    try {
        const raw = localStorage.getItem(PACKING_CACHE_KEY);
        const base = raw ? JSON.parse(raw) : { fechas: [], ensayosByFecha: {}, lastRow: null };
        if (!base.datosByFechaEnsayo) base.datosByFechaEnsayo = {};
        if (!Array.isArray(base.recentSearchKeys)) base.recentSearchKeys = [];
        // Migración: cachés sin LRU o con demasiadas claves (orden de inserción en objeto = aprox. antigüedad)
        var dk = Object.keys(base.datosByFechaEnsayo);
        var migrated = false;
        if (dk.length > MAX_RECENT_BUSQUEDAS_PACKING) {
            var drop = dk.slice(0, dk.length - MAX_RECENT_BUSQUEDAS_PACKING);
            drop.forEach(function (k) {
                delete base.datosByFechaEnsayo[k];
            });
            base.recentSearchKeys = dk.slice(-MAX_RECENT_BUSQUEDAS_PACKING);
            migrated = true;
            console.log('[cache packing] Migración: recortado a ' + MAX_RECENT_BUSQUEDAS_PACKING + ' búsquedas recientes.');
        } else if (base.recentSearchKeys.length === 0 && dk.length > 0) {
            base.recentSearchKeys = dk.slice();
            migrated = true;
        }
        if (migrated) {
            try {
                localStorage.setItem(PACKING_CACHE_KEY, JSON.stringify(base));
            } catch (_) {}
        }
        return base;
    } catch (_) {
        return { fechas: [], ensayosByFecha: {}, lastRow: null, datosByFechaEnsayo: {}, recentSearchKeys: [] };
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
            Object.keys(partial.datosByFechaEnsayo).forEach(function (k) {
                touchRecentSearchInMemory(cache, k);
            });
        }
        localStorage.setItem(PACKING_CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
        if (e && e.name === 'QuotaExceededError') {
            try {
                var c = getPackingCache();
                c.datosByFechaEnsayo = {};
                c.recentSearchKeys = [];
                localStorage.setItem(PACKING_CACHE_KEY, JSON.stringify(c));
            } catch (_) {}
        }
    }
}

/** Contador para nombres JSONP únicos (varios GET en el mismo ms pisan window[callback] si solo usan Date.now()). */
let jsonpCallbackSeq = 0;

/**
 * Tiempo máx. de espera JSONP (GET a Apps Script).
 * - Menos de ~10 s suele cortar respuestas válidas y antes borrábamos el callback → ReferenceError en consola.
 * - Tras timeout se deja un stub en window[callback] (respuesta tardía no rompe la página).
 * - 28 s: equilibrio entre cold start del script y no dejar al usuario esperando un minuto.
 */
const JSONP_GET_TIMEOUT_MS = 28000;

/** GET vía JSONP (evita CORS: carga con <script>, misma URL que POST). */
function fetchGetJsonp(url) {
    return new Promise((resolve, reject) => {
        const name = 'tiemposJsonp_' + Date.now() + '_' + (++jsonpCallbackSeq) + '_' + Math.random().toString(36).slice(2, 10);
        const sep = url.indexOf('?') >= 0 ? '&' : '?';
        const scriptUrl = url + sep + 'callback=' + encodeURIComponent(name);

        console.log('[GET Enviando] URL completa:', scriptUrl);
        console.log('[GET Enviando] Parámetros en la URL:', url.replace(API_URL, '').replace(/^\?/, '') || '(ninguno, pide fechas)');

        let settled = false;
        let timerId = null;
        const script = document.createElement('script');

        const removeScript = () => {
            try { if (script.parentNode) script.remove(); } catch (_) {}
        };

        /** Tras timeout/error: no borrar window[name] (el <script> puede ejecutarse después y llamar al callback). Dejar no-op evita ReferenceError. */
        const stubCallbackIfNeeded = () => {
            try {
                window[name] = function () {
                    try { delete window[name]; } catch (_) {}
                };
            } catch (_) {}
        };

        const cleanupSuccess = () => {
            if (timerId != null) clearTimeout(timerId);
            removeScript();
            try { delete window[name]; } catch (_) {}
        };

        window[name] = (data) => {
            if (settled) return;
            settled = true;
            cleanupSuccess();
            console.log('[GET Respuesta recibida]', data);
            resolve(data || { ok: false, error: "Respuesta inválida" });
        };

        timerId = setTimeout(() => {
            if (settled) return;
            settled = true;
            removeScript();
            stubCallbackIfNeeded();
            console.warn('[GET Timeout] No hubo respuesta en ' + JSONP_GET_TIMEOUT_MS / 1000 + ' s.');
            reject(new Error(MSJ_JSONP_TIMEOUT));
        }, JSONP_GET_TIMEOUT_MS);

        script.onerror = () => {
            if (settled) return;
            settled = true;
            removeScript();
            if (timerId != null) clearTimeout(timerId);
            stubCallbackIfNeeded();
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

/** Una sola petición JSONP a la vez por fecha (evita doble timeout si se dispara change dos veces o UI rápida). */
const ensayosPorFechaInflight = new Map();

/** GET: lista de ensayos para una fecha. Con internet intenta servidor y guarda en caché; sin internet devuelve caché al instante. */
export async function getEnsayosPorFecha(fecha) {
    const f = (fecha || '').trim();
    if (!f) return { ok: false, ensayos: [], error: 'Fecha requerida.' };
    if (!navigator.onLine) {
        const cache = getPackingCache();
        const cached = cache.ensayosByFecha && cache.ensayosByFecha[f];
        if (Array.isArray(cached) && cached.length > 0)
            return { ok: true, ensayos: cached, fromCache: true };
        if (cached && Array.isArray(cached.ensayos) && cached.ensayos.length > 0)
            return {
                ok: true,
                ensayos: cached.ensayos,
                ensayosConVisual: cached.ensayosConVisual || {},
                ensayosConPacking: cached.ensayosConPacking || {},
                ensayosConC5: cached.ensayosConC5 || {},
                ensayosConThermoKing: cached.ensayosConThermoKing || {},
                fundoPorEnsayo: cached.fundoPorEnsayo || {},
                fromCache: true
            };
        return { ok: false, ensayos: [], error: MSJ_SIN_CONEXION };
    }
    if (ensayosPorFechaInflight.has(f)) {
        console.log('[getEnsayosPorFecha] Reutilizando petición en curso para fecha=' + f);
        return ensayosPorFechaInflight.get(f);
    }
    const promise = (async () => {
        console.log('[getEnsayosPorFecha] Enviando: fecha=' + f + ' → el servidor debe devolver { ok: true, ensayos: ["Ensayo 1", "Ensayo 2", ...] }');
        try {
            const url = API_URL + "?fecha=" + encodeURIComponent(f);
            const out = await fetchGetJsonp(url);
            if (out.ok && Array.isArray(out.ensayos)) {
                console.log('[getEnsayosPorFecha] OK. Ensayos recibidos:', out.ensayos);
                setPackingCache({
                    ensayosByFecha: {
                        [f]: {
                            ensayos: out.ensayos,
                            ensayosConVisual: out.ensayosConVisual || {},
                            ensayosConPacking: out.ensayosConPacking || {},
                            ensayosConC5: out.ensayosConC5 || {},
                            ensayosConThermoKing: out.ensayosConThermoKing || {},
                            fundoPorEnsayo: out.fundoPorEnsayo || {}
                        }
                    }
                });
                return out;
            }
            const cache = getPackingCache();
            const cached = cache.ensayosByFecha && cache.ensayosByFecha[f];
            if (Array.isArray(cached) && cached.length > 0) {
                console.log('[getEnsayosPorFecha] Usando caché. Ensayos:', cached);
                return { ok: true, ensayos: cached, fromCache: true };
            }
            if (cached && Array.isArray(cached.ensayos) && cached.ensayos.length > 0) {
                console.log('[getEnsayosPorFecha] Usando caché. Ensayos:', cached.ensayos);
                return {
                    ok: true,
                    ensayos: cached.ensayos,
                    ensayosConVisual: cached.ensayosConVisual || {},
                    ensayosConPacking: cached.ensayosConPacking || {},
                    ensayosConC5: cached.ensayosConC5 || {},
                    ensayosConThermoKing: cached.ensayosConThermoKing || {},
                    fundoPorEnsayo: cached.fundoPorEnsayo || {},
                    fromCache: true
                };
            }
            console.warn('[getEnsayosPorFecha] Sin datos. Error:', out.error);
            return { ok: false, ensayos: [], error: out.error || "No se pudieron cargar los ensayos." };
        } catch (e) {
            const cache = getPackingCache();
            const cached = cache.ensayosByFecha && cache.ensayosByFecha[f];
            if (Array.isArray(cached) && cached.length > 0) {
                console.log('[getEnsayosPorFecha] Falló la petición, usando caché.');
                return { ok: true, ensayos: cached, fromCache: true };
            }
            if (cached && Array.isArray(cached.ensayos) && cached.ensayos.length > 0) {
                console.log('[getEnsayosPorFecha] Falló la petición, usando caché.');
                return {
                    ok: true,
                    ensayos: cached.ensayos,
                    ensayosConVisual: cached.ensayosConVisual || {},
                    ensayosConPacking: cached.ensayosConPacking || {},
                    ensayosConC5: cached.ensayosConC5 || {},
                    ensayosConThermoKing: cached.ensayosConThermoKing || {},
                    fundoPorEnsayo: cached.fundoPorEnsayo || {},
                    fromCache: true
                };
            }
            console.warn('[getEnsayosPorFecha] Error:', e && e.message);
            return { ok: false, ensayos: [], error: e && e.message ? e.message : MSJ_SIN_CONEXION };
        }
    })();
    ensayosPorFechaInflight.set(f, promise);
    promise.finally(() => {
        ensayosPorFechaInflight.delete(f);
    });
    return promise;
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
        touchRecentSearchInMemory(cache, key);
        try {
            localStorage.setItem(PACKING_CACHE_KEY, JSON.stringify(cache));
        } catch (_) {}
        console.log('[getDatosPacking] Caché hit para', key, '(numFilas=', cache.datosByFechaEnsayo[key].numFilas + ')');
        return { ok: true, data: cache.datosByFechaEnsayo[key], fromCache: true };
    }
    if (!navigator.onLine) {
        if (cache.datosByFechaEnsayo && cache.datosByFechaEnsayo[key]) {
            touchRecentSearchInMemory(cache, key);
            try {
                localStorage.setItem(PACKING_CACHE_KEY, JSON.stringify(cache));
            } catch (_) {}
            console.log('[getDatosPacking] Sin internet: usando caché de búsqueda reciente para', key);
            return { ok: true, data: cache.datosByFechaEnsayo[key], fromCache: true };
        }
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
        var cacheAfter = getPackingCache();
        if (cacheAfter.datosByFechaEnsayo && cacheAfter.datosByFechaEnsayo[key]) {
            touchRecentSearchInMemory(cacheAfter, key);
            try {
                localStorage.setItem(PACKING_CACHE_KEY, JSON.stringify(cacheAfter));
            } catch (_) {}
            console.log('[getDatosPacking] Falló la petición, usando caché de búsqueda reciente para', key);
            return { ok: true, data: cacheAfter.datosByFechaEnsayo[key], fromCache: true };
        }
        if (cacheAfter.lastRow && cacheAfter.lastRow.fecha === fecha && String(cacheAfter.lastRow.ensayo_numero) === String(ensayoNumero)) {
            console.log('[getDatosPacking] Falló la petición, usando lastRow.');
            return { ok: true, data: cacheAfter.lastRow.data, fromCache: true };
        }
        console.warn('[getDatosPacking] Error:', e && e.message);
        return { ok: false, data: null, error: e && e.message ? e.message : MSJ_SIN_CONEXION };
    }
}