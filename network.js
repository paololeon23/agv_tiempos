// network.js - Blindaje de Datos para MTTP Arándano
export const STORAGE_KEY = "tiempos_agro_seguro_v1";
const API_URL = "https://script.google.com/macros/s/AKfycbyBCmkCN85Y_35jBxHnUyFJ_myHi6Khgoyh0dKq1Zqup_oNtWfdnVMnlEQssXJYotSF/exec";

let isSyncing = false;
let retryTimeoutId = null;

// Actualiza el Card de Conexión y el contador de pendientes; si hay señal, intenta sincronizar
export function updateUI() {
    const items = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    const pendingCount = items.filter(i => i.status !== 'subido').length;
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
    const pending = items.filter(i => i.status !== 'subido').length;
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
export const saveLocal = (data) => {
    const current = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    const rowsStr = JSON.stringify((data.rows || []).map(r => r.slice(0, 50)));
    const yaHayIgual = current.some(it => it.status !== 'subido' && JSON.stringify((it.rows || []).map(r => r.slice(0, 50))) === rowsStr);
    if (yaHayIgual) {
        return;
    }
    const dataConId = {
        ...data,
        uid: 'REG-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
        timestamp: new Date().toLocaleString(),
        status: 'pendiente'
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...current, dataConId]));
    updateUI();
};

// Enviar a Google Apps Script (mode no-cors evita CORS)
async function sendToCloud(d) {
    await fetch(API_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(d)
    });
}

// Sincronización: un registro a la vez. Si falla la red, no se muestra error; se reintenta al volver la señal.
async function sync() {
    if (isSyncing || !navigator.onLine) return;

    const items = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    const pendingItems = items.filter(i => i.status !== 'subido');
    if (pendingItems.length === 0) return;

    isSyncing = true;
    const queue = [...pendingItems];

    for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        try {
            await sendToCloud(item);
            let currentItems = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
            currentItems = currentItems.map(it =>
                it.uid === item.uid ? { ...it, status: 'subido' } : it
            );
            localStorage.setItem(STORAGE_KEY, JSON.stringify(currentItems));
            updateUI();
            await new Promise(r => setTimeout(r, 2500));
        } catch (_e) {
            // Conexión falló (ERR_CONNECTION_RESET, etc.). No mostrar error; los datos siguen en cola.
            // Se reintentará al volver la señal (online) o con el temporizador.
            break;
        }
    }

    isSyncing = false;
}

const MSJ_SIN_CONEXION = "Sin conexión. Conéctate para cargar datos.";
const PACKING_CACHE_KEY = "tiempos_packing_cache_v1";

function getPackingCache() {
    try {
        const raw = localStorage.getItem(PACKING_CACHE_KEY);
        return raw ? JSON.parse(raw) : { fechas: [], ensayosByFecha: {}, lastRow: null };
    } catch (_) {
        return { fechas: [], ensayosByFecha: {}, lastRow: null };
    }
}

function setPackingCache(partial) {
    try {
        const cache = getPackingCache();
        if (partial.fechas != null) cache.fechas = partial.fechas;
        if (partial.ensayosByFecha != null) cache.ensayosByFecha = { ...cache.ensayosByFecha, ...partial.ensayosByFecha };
        if (partial.lastRow != null) cache.lastRow = partial.lastRow;
        localStorage.setItem(PACKING_CACHE_KEY, JSON.stringify(cache));
    } catch (_) {}
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
            console.warn('[GET Timeout] No hubo respuesta en 15 s.');
            reject(new Error(MSJ_SIN_CONEXION));
        }, 15000);

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

/** GET: fila por fecha y ensayo_numero. Parámetros: ?fecha=...&ensayo_numero=1|2|3|4 */
export async function getDatosPacking(fecha, ensayoNumero) {
    console.log('[getDatosPacking] Enviando: fecha=' + fecha + ', ensayo_numero=' + ensayoNumero + ' → el servidor debe devolver { ok: true, data: { ... } }');
    try {
        const url = API_URL + "?fecha=" + encodeURIComponent(fecha) + "&ensayo_numero=" + encodeURIComponent(ensayoNumero);
        const out = await fetchGetJsonp(url);
        if (out.ok && out.data) {
            console.log('[getDatosPacking] OK. Data recibida:', out.data);
            setPackingCache({ lastRow: { fecha, ensayo_numero: ensayoNumero, data: out.data } });
            return out;
        }
        const cache = getPackingCache();
        if (cache.lastRow && cache.lastRow.fecha === fecha && cache.lastRow.ensayo_numero === ensayoNumero) {
            console.log('[getDatosPacking] Usando caché.');
            return { ok: true, data: cache.lastRow.data, fromCache: true };
        }
        console.warn('[getDatosPacking] Sin datos. Error:', out.error);
        return { ok: false, data: null, error: out.error || "No hay registro." };
    } catch (e) {
        const cache = getPackingCache();
        if (cache.lastRow && cache.lastRow.fecha === fecha && cache.lastRow.ensayo_numero === ensayoNumero) {
            console.log('[getDatosPacking] Falló la petición, usando caché.');
            return { ok: true, data: cache.lastRow.data, fromCache: true };
        }
        console.warn('[getDatosPacking] Error:', e && e.message);
        return { ok: false, data: null, error: e && e.message ? e.message : MSJ_SIN_CONEXION };
    }
}
