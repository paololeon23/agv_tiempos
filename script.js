import { saveLocal, updateUI, getDatosPacking, getEnsayosPorFecha, existeRegistroFechaEnsayo, getListadoRegistrados, getPackingCache, postPacking, postRecepcionC5, savePackingToQueue, primeGetCache, STORAGE_KEY } from './network.js';

/**
 * Vista previa del PDF en el mismo modal (como siempre).
 * Usa PDF.js (canvas) si está cargado: funciona en tablet/iPhone donde iframe+blob falla.
 * Si no hay PDF.js o hay error, usa iframe como respaldo.
 */
function mostrarVistaPreviaPdf(blobUrl, nombreArchivo) {
    function descargar() {
        var a = document.createElement('a');
        a.href = blobUrl;
        a.download = nombreArchivo;
        a.click();
    }
    var ancho = Math.min(920, typeof window.innerWidth === 'number' ? window.innerWidth - 24 : 920);
    return Swal.fire({
        title: 'Vista previa del PDF',
        html: '<div id="swal-pdf-viewer-root" class="pdf-modal-viewer-root"></div>',
        width: ancho,
        customClass: { popup: 'swal-pdf-viewer-popup' },
        showConfirmButton: false,
        showDenyButton: true,
        denyButtonText: 'Descargar PDF',
        showCancelButton: true,
        cancelButtonText: 'Cerrar',
        denyButtonColor: '#28a745',
        cancelButtonColor: '#6c757d',
        didOpen: function (popup) {
            renderPdfEnModal(blobUrl, popup);
        }
    }).then(function (r) {
        if (r.isDenied) descargar();
        setTimeout(function () {
            try { URL.revokeObjectURL(blobUrl); } catch (e) {}
        }, 600);
    });
}

function renderPdfEnModal(blobUrl, popup) {
    var PDF_ZOOM_INICIAL = 0.83;
    var root = (popup && popup.querySelector) ? popup.querySelector('#swal-pdf-viewer-root') : document.getElementById('swal-pdf-viewer-root');
    if (!root) return;
    root.className = 'pdf-modal-viewer-root';
    root.innerHTML = '<p class="pdf-rendering-hint">Cargando vista previa…</p>';

    function ponerIframe() {
        root.innerHTML = '<iframe src="' + blobUrl + '" style="width:100%;height:70vh;border:1px solid #ddd;border-radius:4px" title="Vista previa PDF"></iframe>';
    }

    if (typeof pdfjsLib === 'undefined') {
        ponerIframe();
        return;
    }
    try {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    } catch (e) {}

    var box = popup && popup.querySelector ? popup.querySelector('.swal2-popup') : null;
    var maxW = Math.min(880, (box && box.clientWidth) ? box.clientWidth - 32 : 600);

    var state = {
        pdf: null,
        fitScale: 1,
        userZoom: PDF_ZOOM_INICIAL,
        maxW: maxW,
        rendering: false
    };

    function setToolbarBusy(busy, btnOut, btnIn, btnFit) {
        [btnOut, btnIn, btnFit].forEach(function (b) {
            if (b) b.disabled = !!busy;
        });
    }

    function buildToolbar() {
        root.innerHTML = '';
        var toolbar = document.createElement('div');
        toolbar.className = 'pdf-zoom-toolbar';
        toolbar.innerHTML =
            '<button type="button" class="pdf-zoom-btn" id="swal-pdf-zoom-out" title="Alejar" aria-label="Alejar">−</button>' +
            '<span class="pdf-zoom-label" id="swal-pdf-zoom-pct">83%</span>' +
            '<button type="button" class="pdf-zoom-btn" id="swal-pdf-zoom-in" title="Acercar" aria-label="Acercar">+</button>' +
            '<button type="button" class="pdf-zoom-btn pdf-zoom-fit" id="swal-pdf-zoom-fit" title="Volver a 83%" aria-label="Volver a 83%">Ajustar</button>';
        var wrap = document.createElement('div');
        wrap.id = 'swal-pdf-canvas-wrap';
        wrap.className = 'pdf-canvas-scroll';
        wrap.setAttribute('role', 'region');
        wrap.setAttribute('aria-label', 'Contenido del PDF');
        root.appendChild(toolbar);
        root.appendChild(wrap);

        var pctEl = root.querySelector('#swal-pdf-zoom-pct');
        var btnOut = root.querySelector('#swal-pdf-zoom-out');
        var btnIn = root.querySelector('#swal-pdf-zoom-in');
        var btnFit = root.querySelector('#swal-pdf-zoom-fit');

        function updateLabel() {
            if (pctEl) pctEl.textContent = Math.round(state.userZoom * 100) + '%';
        }

        async function renderAll() {
            if (state.rendering || !state.pdf) return;
            state.rendering = true;
            setToolbarBusy(true, btnOut, btnIn, btnFit);
            var wrapEl = root.querySelector('#swal-pdf-canvas-wrap');
            wrapEl.innerHTML = '<p class="pdf-rendering-hint">Renderizando…</p>';
            try {
                var scale = state.fitScale * state.userZoom;
                scale = Math.max(0.22, Math.min(3.2, scale));
                var n = state.pdf.numPages;
                wrapEl.innerHTML = '';
                for (var p = 1; p <= n; p++) {
                    var page = await state.pdf.getPage(p);
                    var viewport = page.getViewport({ scale: scale });
                    var canvas = document.createElement('canvas');
                    var ctx = canvas.getContext('2d');
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    canvas.className = 'pdf-page-canvas';
                    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
                    wrapEl.appendChild(canvas);
                }
            } catch (e) {
                console.warn('PDF render página:', e);
                wrapEl.innerHTML = '<p class="pdf-rendering-hint">No se pudo renderizar. Usa Descargar PDF.</p>';
            } finally {
                state.rendering = false;
                setToolbarBusy(false, btnOut, btnIn, btnFit);
            }
        }

        btnOut.addEventListener('click', function () {
            state.userZoom = Math.max(0.5, state.userZoom / 1.2);
            updateLabel();
            renderAll();
        });
        btnIn.addEventListener('click', function () {
            state.userZoom = Math.min(2.8, state.userZoom * 1.2);
            updateLabel();
            renderAll();
        });
        btnFit.addEventListener('click', function () {
            state.userZoom = PDF_ZOOM_INICIAL;
            updateLabel();
            renderAll();
        });

        updateLabel();
        return renderAll;
    }

    fetch(blobUrl)
        .then(function (r) { return r.arrayBuffer(); })
        .then(function (buf) {
            return pdfjsLib.getDocument({ data: buf }).promise;
        })
        .then(function (pdf) {
            state.pdf = pdf;
            return pdf.getPage(1).then(function (page) {
                var vp1 = page.getViewport({ scale: 1 });
                state.fitScale = Math.min(1.85, state.maxW / vp1.width);
                state.userZoom = PDF_ZOOM_INICIAL;
                var renderAll = buildToolbar();
                return renderAll();
            });
        })
        .catch(function (err) {
            console.warn('PDF.js vista previa:', err);
            ponerIframe();
        });
}

/** Responsable predeterminado en la cabecera de Formato campo. */
var RESPONSABLE_CAMPO_PREDETERMINADO = 'Antony Siesquén';

/**
 * Trazabilidad (Formato campo): por fundo, etapas permitidas y campos por etapa (números separados del negocio).
 * Claves de etapa como string para coincidir con option value.
 */
var FUNDO_TRAZABILIDAD_ETAPA_CAMPO = {
    c5: { '1': [1, 3, 4, 5, 7], '2': [1, 2, 3, 4, 5, 6], '3': [1, 2, 3, 5, 6] },
    c6: { '4': [1, 2, 3, 4, 5, 6, 7, 8, 9], '5': [1, 2, 3, 4, 5] },
    a9: { '6': [1, 2, 3, 4, 5, 6], '7': [1, 2, 3, 4, 5, 6, 7], '8': [1, 2, 3, 4, 5, 6] },
    ln: { '1': [3, 4, 5, 6], '2': [3, 4, 5, 6] }
};

function normalizarValorFundoSelect(v) {
    if (v == null || v === '') return '';
    var s = String(v).trim().toLowerCase();
    if (s === 'c5' || s === 'c6' || s === 'a9' || s === 'ln') return s;
    return '';
}

function regRefrescarCampoDesdeEtapaActual() {
    var fundoEl = document.getElementById('reg_fundo');
    var etapaEl = document.getElementById('reg_traz_etapa');
    var campoEl = document.getElementById('reg_traz_campo');
    if (!fundoEl || !etapaEl || !campoEl) return;
    var fk = normalizarValorFundoSelect(fundoEl.value);
    var map = FUNDO_TRAZABILIDAD_ETAPA_CAMPO[fk];
    var es = String(etapaEl.value || '').trim();
    campoEl.innerHTML = '';
    var o0 = document.createElement('option');
    o0.value = '';
    o0.textContent = 'Campo';
    o0.disabled = true;
    o0.selected = true;
    campoEl.appendChild(o0);
    if (!map || !es || map[es] == null) {
        campoEl.disabled = true;
        campoEl.value = '';
        return;
    }
    campoEl.disabled = false;
    map[es].forEach(function (n) {
        var op = document.createElement('option');
        op.value = String(n);
        op.textContent = 'C' + n;
        campoEl.appendChild(op);
    });
}

/**
 * Repuebla Etapa/Campo según #reg_fundo. Si opts trae valores guardados y siguen siendo válidos, los reaplica.
 */
function sincronizarTrazabilidadRegCampo(opts) {
    opts = opts || {};
    var trEt = opts.trazEtapa != null ? String(opts.trazEtapa).trim() : '';
    var trCa = opts.trazCampo != null ? String(opts.trazCampo).trim() : '';
    var fundoEl = document.getElementById('reg_fundo');
    var etapaEl = document.getElementById('reg_traz_etapa');
    var campoEl = document.getElementById('reg_traz_campo');
    if (!fundoEl || !etapaEl || !campoEl) return;
    var fk = normalizarValorFundoSelect(fundoEl.value);
    var map = FUNDO_TRAZABILIDAD_ETAPA_CAMPO[fk];

    etapaEl.innerHTML = '';
    var oe = document.createElement('option');
    oe.value = '';
    oe.textContent = 'Etapa';
    oe.disabled = true;
    oe.selected = true;
    etapaEl.appendChild(oe);

    campoEl.innerHTML = '';
    var ocPh = document.createElement('option');
    ocPh.value = '';
    ocPh.textContent = 'Campo';
    ocPh.disabled = true;
    ocPh.selected = true;
    campoEl.appendChild(ocPh);

    if (!fk || !map) {
        etapaEl.disabled = true;
        campoEl.disabled = true;
        etapaEl.value = '';
        campoEl.value = '';
        return;
    }

    etapaEl.disabled = false;
    var etapas = Object.keys(map).map(function (k) { return parseInt(k, 10); }).sort(function (a, b) { return a - b; });
    etapas.forEach(function (n) {
        var op = document.createElement('option');
        op.value = String(n);
        op.textContent = 'E' + n;
        etapaEl.appendChild(op);
    });

    if (trEt && map[trEt] != null) {
        etapaEl.value = trEt;
        oe.selected = false;
        regRefrescarCampoDesdeEtapaActual();
        var nc = parseInt(trCa, 10);
        if (trCa !== '' && !isNaN(nc) && map[trEt].indexOf(nc) !== -1) {
            campoEl.value = String(nc);
        }
    } else {
        etapaEl.value = '';
        campoEl.disabled = true;
    }
}

/** Fecha local YYYY-MM-DD (para inputs type=date). */
function fechaLocalHoy() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
}

/**
 * WebKit móvil a veces no pinta el valor si solo se asigna .value; refuerzo con attribute, defaultValue y eventos.
 * `defaultValue` ayuda a iOS/Safari (sobre todo sin red o tras SW) a mostrar la fecha en el control nativo.
 * @param {{ silent?: boolean }} [opts] — si silent, no dispara input/change (p. ej. espejo RC5 ↔ packing).
 */
function setNativeDateValue(el, isoDate, opts) {
    if (!el || !isoDate) return;
    var s = String(isoDate).trim();
    if (el.getAttribute('data-native-input') === 'date' && el.type !== 'date') {
        el.type = 'date';
        el.placeholder = '';
    }
    el.setAttribute('value', s);
    try { el.defaultValue = s; } catch (e) {}
    el.value = s;
    try { syncMobileNativeDatetimeInput(el); } catch (e) {}
    if (opts && opts.silent) return;
    try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
    try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
}

function setNativeTimeValue(el, hhmm) {
    if (!el || hhmm == null) return;
    var s = String(hhmm).trim();
    if (el.getAttribute('data-native-input') === 'time' && el.type !== 'time') {
        el.type = 'time';
        el.placeholder = '';
    }
    el.setAttribute('value', s);
    try { el.defaultValue = s; } catch (e) {}
    el.value = s;
    try { syncMobileNativeDatetimeInput(el); } catch (e) {}
    try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
    try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
}

/** Mismo breakpoint que style.css (móvil / pantalla pequeña). */
var MOBILE_NATIVE_DT_MQ = '(max-width: 768px)';

function isMobileNativeDatetimeLayout() {
    return typeof window.matchMedia !== 'undefined' && window.matchMedia(MOBILE_NATIVE_DT_MQ).matches;
}

/** Hora dentro de tablas/wraps: placeholder corto para no ensanchar celdas en móvil. */
function isNativeDatetimeInsideCompactTimeArea(el) {
    if (!el || !el.closest) return false;
    if (el.closest('.table-field-style')) return true;
    if (el.closest('.packing-native-time-wrap')) return true;
    return false;
}

function shouldBindMobileNativeDatetime(el) {
    if (!el || el.tagName !== 'INPUT') return false;
    if (el.readOnly || el.disabled) return false;
    if (!el.closest) return false;
    if (el.closest('.swal2-container')) return false;
    return true;
}

function getMobileDatetimePlaceholder(el, nativeType) {
    var p = el.getAttribute('data-mobile-placeholder');
    if (p) return p;
    if (nativeType === 'time' && isNativeDatetimeInsideCompactTimeArea(el)) return '';
    return nativeType === 'date' ? 'Seleccionar fecha' : 'Seleccionar hora';
}

/**
 * En pantalla pequeña: si el campo está vacío, type="text" + placeholder (Chrome/Android muestran date/time en blanco).
 * En escritorio: siempre type=date|time.
 */
function syncMobileNativeDatetimeInput(el) {
    if (!el || !shouldBindMobileNativeDatetime(el)) return;
    var native = el.getAttribute('data-native-input');
    if (native !== 'date' && native !== 'time') return;
    if (!isMobileNativeDatetimeLayout()) {
        if (el.type !== native) el.type = native;
        el.placeholder = '';
        el.removeAttribute('data-compact-time-empty');
        return;
    }
    var v = String(el.value || '').trim();
    if (native === 'time' && isNativeDatetimeInsideCompactTimeArea(el)) {
        if (!v) el.setAttribute('data-compact-time-empty', '1');
        else el.removeAttribute('data-compact-time-empty');
    } else {
        el.removeAttribute('data-compact-time-empty');
    }
    if (!v) {
        el.type = 'text';
        el.placeholder = getMobileDatetimePlaceholder(el, native);
    } else {
        el.type = native;
        el.placeholder = '';
    }
}

function abrirPickerHoraCompacto(el) {
    if (!el) return;
    if (el.getAttribute('data-compact-time-opening') === '1') return;
    el.setAttribute('data-compact-time-opening', '1');
    el.type = 'time';
    el.placeholder = '';
    try { el.focus(); } catch (e) {}
    setTimeout(function () {
        if (typeof el.showPicker === 'function') {
            try { el.showPicker(); } catch (e2) {}
        }
    }, 0);
    setTimeout(function () { el.removeAttribute('data-compact-time-opening'); }, 180);
}

function onMobileNativeDtPointerDown(ev) {
    var el = ev.target;
    if (!el || el.tagName !== 'INPUT') return;
    if (!shouldBindMobileNativeDatetime(el)) return;
    var native = el.getAttribute('data-native-input');
    if (native !== 'time') return;
    if (!isMobileNativeDatetimeLayout()) return;
    if (!isNativeDatetimeInsideCompactTimeArea(el)) return;
    if (el.type !== 'text') return;
    ev.preventDefault();
    abrirPickerHoraCompacto(el);
}

function onMobileNativeDtTouchStart(ev) {
    var el = ev.target;
    if (!el || el.tagName !== 'INPUT') return;
    if (!shouldBindMobileNativeDatetime(el)) return;
    var native = el.getAttribute('data-native-input');
    if (native !== 'time') return;
    if (!isMobileNativeDatetimeLayout()) return;
    if (!isNativeDatetimeInsideCompactTimeArea(el)) return;
    if (el.type !== 'text') return;
    ev.preventDefault();
    abrirPickerHoraCompacto(el);
}

function onMobileNativeDtFocus(ev) {
    var el = ev.target;
    if (!el || el.tagName !== 'INPUT') return;
    if (!shouldBindMobileNativeDatetime(el)) return;
    var native = el.getAttribute('data-native-input');
    if (native !== 'date' && native !== 'time') return;
    if (!isMobileNativeDatetimeLayout()) return;
    if (native === 'time' && isNativeDatetimeInsideCompactTimeArea(el) && !String(el.value || '').trim()) return;
    if (el.type === 'text') {
        el.type = native;
        el.placeholder = '';
    }
}

function onMobileNativeDtBlur(ev) {
    var el = ev.target;
    if (!el || el.tagName !== 'INPUT') return;
    if (!shouldBindMobileNativeDatetime(el)) return;
    var native = el.getAttribute('data-native-input');
    if (native !== 'date' && native !== 'time') return;
    if (!isMobileNativeDatetimeLayout()) return;
    if (!String(el.value || '').trim()) {
        el.type = 'text';
        el.placeholder = getMobileDatetimePlaceholder(el, native);
    }
    try { syncMobileNativeDatetimeInput(el); } catch (e) {}
}

function bindMobileNativeDatetimeInputs(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var toBind = [];
    scope.querySelectorAll('input[type="date"], input[type="time"]').forEach(function (el) {
        if (shouldBindMobileNativeDatetime(el)) toBind.push(el);
    });
    scope.querySelectorAll('input[type="text"][data-native-input]').forEach(function (el) {
        if (shouldBindMobileNativeDatetime(el)) toBind.push(el);
    });
    toBind.forEach(function (el) {
        var native = el.getAttribute('data-native-input') || (el.type === 'date' ? 'date' : 'time');
        el.setAttribute('data-native-input', native);
        if (el.getAttribute('data-mobile-dt-bound') === '1') return;
        el.setAttribute('data-mobile-dt-bound', '1');
        el.addEventListener('pointerdown', onMobileNativeDtPointerDown, true);
        el.addEventListener('touchstart', onMobileNativeDtTouchStart, { capture: true, passive: false });
        el.addEventListener('focus', onMobileNativeDtFocus, true);
        el.addEventListener('blur', onMobileNativeDtBlur, true);
    });
    toBind.forEach(function (el) {
        var native = el.getAttribute('data-native-input');
        if (native === 'date' || native === 'time') syncMobileNativeDatetimeInput(el);
    });
}

var _mobileNativeDtMo = null;
function initMobileNativeDatetimeObserver() {
    if (_mobileNativeDtMo || typeof MutationObserver === 'undefined') return;
    var t;
    _mobileNativeDtMo = new MutationObserver(function () {
        clearTimeout(t);
        t = setTimeout(function () {
            try { bindMobileNativeDatetimeInputs(document); } catch (e) {}
        }, 80);
    });
    try {
        _mobileNativeDtMo.observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
    if (window.matchMedia) {
        var mq = window.matchMedia(MOBILE_NATIVE_DT_MQ);
        var mqHandler = function () {
            try {
                document.querySelectorAll('input[data-native-input]').forEach(syncMobileNativeDatetimeInput);
            } catch (e) {}
        };
        if (mq.addEventListener) mq.addEventListener('change', mqHandler);
        else if (mq.addListener) mq.addListener(mqHandler);
    }
}

/** Valores visibles en móvil/tablet al cargar (módulos ES pueden ejecutarse después de DOMContentLoaded). */
function aplicarValoresFechaHoraPorDefecto() {
    var hoy = fechaLocalHoy();
    var regFecha = document.getElementById('reg_fecha');
    if (regFecha) setNativeDateValue(regFecha, hoy);
    var viewFecha = document.getElementById('view_fecha');
    if (viewFecha && !String(viewFecha.value || '').trim()) setNativeDateValue(viewFecha, hoy);
    var vfi = document.getElementById('view_fecha_inspeccion');
    if (vfi && !String(vfi.value || '').trim()) {
        var refIns = viewFecha && String(viewFecha.value || '').trim() ? String(viewFecha.value).trim() : hoy;
        setNativeDateValue(vfi, refIns);
    }
    var vhr = document.getElementById('view_hora_recepcion');
    if (vhr && !String(vhr.value || '').trim()) setNativeTimeValue(vhr, '07:15');
    var viewFechaRc5 = document.getElementById('view_fecha_rc5');
    if (viewFechaRc5 && !String(viewFechaRc5.value || '').trim()) setNativeDateValue(viewFechaRc5, hoy);
    var regHoraIni = document.getElementById('reg_hora_inicio');
    if (regHoraIni && !String(regHoraIni.value || '').trim()) setNativeTimeValue(regHoraIni, '07:15');
    var regResp = document.getElementById('reg_responsable');
    if (regResp && !String(regResp.value || '').trim()) regResp.value = RESPONSABLE_CAMPO_PREDETERMINADO;
}

/**
 * #formato-packing: fecha de inspección alineada a la fecha del registro (o hoy) para que siempre se vea en móvil.
 * Sin disparar change en view_fecha (evita limpiar ensayo).
 */
function asegurarFechasMetaPackingVisibles() {
    var hoy = fechaLocalHoy();
    var vf = document.getElementById('view_fecha');
    var vfi = document.getElementById('view_fecha_inspeccion');
    if (!vfi) return;
    if (String(vfi.value || '').trim()) return;
    var ref = vf && String(vf.value || '').trim() ? String(vf.value).trim() : hoy;
    setNativeDateValue(vfi, ref, { silent: true });
}

function initApp() {

    /** Debe existir antes de aplicarRutaDesdeHash / setActiveView (evita tipoActual '' y datosEnsayos[undefined][1]). */
    let tipoActual = '';
    let ensayoActual = '';
    /** Al entrar en Packing: poner fecha de hoy y cargar lista de ensayos (sin rellenar la hoja hasta «Cargar datos»). */
    function packingInicializarBusquedaAutomatica() {
        var el = document.getElementById('view_fecha');
        if (!el) return;
        /** setNativeDateValue ya dispara input/change; no duplicar change (provocaba 2× getEnsayosPorFecha y 2× timeout en consola). */
        setNativeDateValue(el, fechaLocalHoy());
    }

    /**
     * Al volver a Packing/C5 desde otra vista: no forzar fecha a «hoy» con setNativeDateValue (dispararía change en
     * view_fecha → limpiar ensayo y tablas). Re-pintar borrador en memoria para la fecha/ensayo actuales.
     * currentFechaPacking / currentEnsayoPacking viven más abajo en initApp; el callback corre tras inicializarlos.
     */
    function packingReaplicarBorradorSiHaySesion() {
        if (!currentFechaPacking || !currentEnsayoPacking) return;
        var fechaEl = document.getElementById('view_fecha');
        var ensayoEl = document.getElementById('view_ensayo_numero');
        if (fechaEl && currentFechaPacking) {
            setNativeDateValue(fechaEl, currentFechaPacking, { silent: true });
        }
        if (ensayoEl) {
            try { ensayoEl.value = currentEnsayoPacking; } catch (e) {}
        }
        restaurarPackingDesdeStore(currentFechaPacking, currentEnsayoPacking);
        syncFechaEnsayoEspejoDesdePrimario();
    }

    // --- Inicio: aviso salir, iconos ---
    window.formHasChanges = false;
    aplicarValoresFechaHoraPorDefecto();
    asegurarFechasMetaPackingVisibles();
    bindMobileNativeDatetimeInputs(document);
    initMobileNativeDatetimeObserver();
    if (window.lucide) lucide.createIcons();

    // Con internet: rellenar caché de GET (fechas, listado) para usarlos offline; al volver online sincronizar colas y refrescar caché
    if (typeof primeGetCache === 'function' && typeof updateUI === 'function') {
        primeGetCache().catch(() => {});
        window.addEventListener('online', () => {
            updateUI();
            primeGetCache().catch(() => {});
        });
    }

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

    // --- Sidebar y vistas (Formato campo / packing / Historial / Recomendaciones) ---
    const sidebar = document.getElementById('sidebar');
    const menuBtn = document.getElementById('menu-btn');
    const closeBtn = document.getElementById('close-btn');
    const cosechaForm = document.getElementById('cosecha-form');
    const historialView = document.getElementById('view-historial');
    const recomendacionesView = document.getElementById('view-recomendaciones');

    let currentSidebarView = 'campo';

    /* Antes de setActiveView / aplicarRutaDesdeHash (init temprano): evita TDZ con const/let al llamar actualizarBannerFormatoPacking. */
    const inputFechaPacking = document.getElementById('view_fecha');
    const selEnsayoPacking = document.getElementById('view_ensayo_numero');
    let currentFechaPacking = '';
    let currentEnsayoPacking = '';

    /** Copia opciones de un <select> a otro (innerHTML entre selects falla en algunos móviles/WebKit). */
    function copiarOpcionesSelect_(origen, destino) {
        if (!origen || !destino) return;
        var val = origen.value;
        var dis = origen.disabled;
        destino.innerHTML = '';
        for (var i = 0; i < origen.options.length; i++) {
            destino.appendChild(origen.options[i].cloneNode(true));
        }
        try {
            destino.value = val;
        } catch (e) {}
        if (val && destino.value !== val) {
            try {
                destino.selectedIndex = origen.selectedIndex;
            } catch (e2) {}
        }
        destino.disabled = dis;
    }

    /** Solo fecha RC5 ← primario (evita copiar ensayo vacío antes de que termine getEnsayosPorFecha). */
    function syncFechaEspejoSoloFechaDesdePrimario() {
        var vf = document.getElementById('view_fecha_rc5');
        var inp = document.getElementById('view_fecha');
        if (!vf || !inp) return;
        var raw = String(inp.value || '').trim();
        if (raw) setNativeDateValue(vf, raw, { silent: true });
        else {
            vf.value = '';
            try { vf.removeAttribute('value'); vf.defaultValue = ''; } catch (e) {}
        }
    }

    /** Espejo visual #recepcion-c5 ↔ campos canónicos view_fecha / view_ensayo_numero (merge y guardado sin cambios). */
    function syncFechaEnsayoEspejoDesdePrimario() {
        syncFechaEspejoSoloFechaDesdePrimario();
        var se = document.getElementById('view_ensayo_numero_rc5');
        var sel = document.getElementById('view_ensayo_numero');
        copiarOpcionesSelect_(sel, se);
    }
    function aplicarPrimarioDesdeCamposRc5SiCorresponde() {
        if (currentSidebarView !== 'recepcion-c5') return;
        var vf = document.getElementById('view_fecha_rc5');
        var inp = document.getElementById('view_fecha');
        var se = document.getElementById('view_ensayo_numero_rc5');
        var sel = document.getElementById('view_ensayo_numero');
        if (vf && inp) {
            var rawRc = String(vf.value || '').trim();
            if (rawRc) setNativeDateValue(inp, rawRc, { silent: true });
            else {
                inp.value = '';
                try { inp.removeAttribute('value'); inp.defaultValue = ''; } catch (e) {}
            }
        }
        if (se && sel) {
            copiarOpcionesSelect_(se, sel);
        }
    }

    function isVistaPackingSidebar() {
        return currentSidebarView === 'formato-packing' || currentSidebarView === 'recepcion-c5';
    }

    function aplicarRutaPackingLayout(soloRecepcionC5) {
        var container = document.getElementById('view_packing_container');
        if (!container) return;
        container.classList.toggle('packing-route--recepcion-c5', !!soloRecepcionC5);
    }

    function setPackingSubnavOpen(open) {
        var btn = document.getElementById('nav_btn_packing_desglose');
        var sub = document.getElementById('subnav_packing_desglose');
        var grp = document.getElementById('sidebar_nav_group_packing');
        if (!btn || !sub) return;
        if (open) {
            btn.setAttribute('aria-expanded', 'true');
            sub.setAttribute('aria-hidden', 'false');
            if (grp) grp.classList.add('sidebar-nav-group--open');
        } else {
            btn.setAttribute('aria-expanded', 'false');
            sub.setAttribute('aria-hidden', 'true');
            if (grp) grp.classList.remove('sidebar-nav-group--open');
        }
    }

    /** Solo el usuario abre/cierra el acordeón; no se fuerza al cambiar de vista. */
    function readPackingAccordionOpen() {
        try {
            var v = sessionStorage.getItem('tiempos_packing_accordion_open');
            if (v === null) return true;
            return v === 'true';
        } catch (_) {
            return true;
        }
    }
    function writePackingAccordionOpen(open) {
        try {
            sessionStorage.setItem('tiempos_packing_accordion_open', open ? 'true' : 'false');
        } catch (_) {}
    }

    function syncSubnavFromSelect() {
        var root = document.getElementById('sidebar');
        if (!root) return;
        var linkCampo = root.querySelector('.sidebar-nav-main a.nav-link[data-view="campo"]');
        var linkPk = root.querySelector('a.nav-link[data-view="formato-packing"]');
        var linkRc5 = root.querySelector('a.nav-link[data-view="recepcion-c5"]');
        var linkHist = root.querySelector('.sidebar-nav-secondary a.nav-link[data-view="historial"]');
        var linkRec = root.querySelector('.sidebar-nav-secondary a.nav-link[data-view="recomendaciones"]');
        if (!linkCampo || !linkPk || !linkRc5) return;

        var isFmt = currentSidebarView === 'formato-packing';
        var isRc5 = currentSidebarView === 'recepcion-c5';
        var inPackingGroup = isFmt || isRc5;
        var isCampo = currentSidebarView === 'campo' || currentSidebarView === 'nueva';
        var isHist = currentSidebarView === 'historial';
        var isRecom = currentSidebarView === 'recomendaciones';

        linkCampo.classList.toggle('active', isCampo && !isHist && !isRecom);
        linkPk.classList.toggle('active', isFmt);
        linkRc5.classList.toggle('active', isRc5);
        if (linkHist) linkHist.classList.toggle('active', isHist);
        if (linkRec) linkRec.classList.toggle('active', isRecom);

        var parentBtn = document.getElementById('nav_btn_packing_desglose');
        if (parentBtn) parentBtn.classList.toggle('nav-link--parent-active', inPackingGroup);
    }

    function applyMedicionMode(mode) {
        const isPacking = mode === 'packing';
        const wrapperFormatoCampo = document.getElementById('wrapper_formato_campo');
        const selTipoMedicion = document.getElementById('tipo_medicion');
        const rotuloEnsayoWrapper = document.getElementById('rotulo_ensayo_wrapper');
        const viewVisualContainer = document.getElementById('view_visual_container');
        const viewPackingContainer = document.getElementById('view_packing_container');
        const btnGuardarRegistro = document.getElementById('btn-guardar-registro');
        const btnGuardarPacking = document.getElementById('btn-guardar-packing');
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

        if (wrapperFormatoCampo) wrapperFormatoCampo.style.display = isPacking ? 'none' : '';
        if (selTipoMedicion) {
            if (isPacking) selTipoMedicion.removeAttribute('required');
            else selTipoMedicion.setAttribute('required', 'required');
        }
        if (rotuloEnsayoWrapper) rotuloEnsayoWrapper.style.display = isPacking ? 'none' : 'block';
        if (viewVisualContainer) viewVisualContainer.style.display = isPacking ? 'none' : 'block';
        if (viewPackingContainer) viewPackingContainer.style.display = isPacking ? 'block' : 'none';
        if (btnGuardarRegistro) btnGuardarRegistro.style.display = isPacking ? 'none' : 'block';
        if (btnGuardarPacking) btnGuardarPacking.style.display = isPacking ? 'block' : 'none';
        if (wrappers.visual) wrappers.visual.style.display = isPacking ? 'none' : 'block';
        if (wrappers.jarras) wrappers.jarras.style.display = isPacking ? 'none' : 'block';
        if (wrappers.temperaturas) wrappers.temperaturas.style.display = isPacking ? 'none' : 'block';
        if (wrappers.tiempos) wrappers.tiempos.style.display = isPacking ? 'none' : 'block';
        if (wrappers.humedad) wrappers.humedad.style.display = isPacking ? 'none' : 'block';
        if (wrappers.presionambiente) wrappers.presionambiente.style.display = isPacking ? 'none' : 'block';
        if (wrappers.presionfruta) wrappers.presionfruta.style.display = isPacking ? 'none' : 'block';
        if (wrappers.observacion) wrappers.observacion.style.display = isPacking ? 'none' : 'block';
        var selRotulo = document.getElementById('reg_rotulo_ensayo');
        if (selRotulo) {
            if (isPacking) selRotulo.removeAttribute('required');
            else selRotulo.setAttribute('required', 'required');
        }
        if (isPacking) syncThermoKingWrapperVisibility();
        if (isPacking) {
            tipoActual = 'packing';
        } else if (selTipoMedicion && selTipoMedicion.value) {
            tipoActual = selTipoMedicion.value;
        }
        if (typeof scheduleThermokingProgressRefresh === 'function') scheduleThermokingProgressRefresh();
    }

    function normalizarRutaView(view) {
        if (view === 'nueva') return 'campo';
        return view;
    }

    function setRouteForView(view) {
        var v = normalizarRutaView(view);
        try {
            if (window.location.hash !== ('#' + v)) history.replaceState(null, '', '#' + v);
            try { sessionStorage.setItem('tiempos_last_route', v); } catch (_) {}
        } catch (_) {}
    }

    function setActiveView(view) {
        var prevSidebar = currentSidebarView;
        /* Como Campo al cambiar de ensayo: guardar borrador del packing actual antes de salir de la vista (menú / historial / campo / otra ruta). */
        if ((currentSidebarView === 'formato-packing' || currentSidebarView === 'recepcion-c5') && view !== currentSidebarView) {
            if (typeof currentFechaPacking !== 'undefined' && currentFechaPacking && currentEnsayoPacking) {
                guardarPackingEnStore(currentFechaPacking, currentEnsayoPacking);
                flushPersistPackingBorradorNow();
            }
        }
        const selTipo = document.getElementById('tipo_medicion');
        const showForm = (view === 'campo' || view === 'formato-packing' || view === 'recepcion-c5' || view === 'nueva');

        if (view === 'historial' || view === 'recomendaciones') {
            currentSidebarView = view;
            document.querySelectorAll('#sidebar a.nav-link[data-view]').forEach(a => {
                a.classList.remove('active');
            });
            var vHist = document.querySelector('#sidebar a.nav-link[data-view="' + view + '"]');
            if (vHist) vHist.classList.add('active');
            var pbHist = document.getElementById('nav_btn_packing_desglose');
            if (pbHist) pbHist.classList.remove('nav-link--parent-active');
            aplicarRutaPackingLayout(false);
        } else if (view === 'campo' || view === 'formato-packing' || view === 'recepcion-c5' || view === 'nueva') {
            document.querySelectorAll('#sidebar .sidebar-nav-secondary a.nav-link[data-view]').forEach(a => {
                a.classList.remove('active');
            });
            if (view === 'formato-packing') {
                currentSidebarView = 'formato-packing';
                if (prevSidebar !== 'formato-packing' && prevSidebar !== 'recepcion-c5') {
                    document.querySelectorAll('.workscope-btn').forEach(function (b) { b.classList.remove('is-active'); });
                }
                aplicarRutaPackingLayout(false);
                applyMedicionMode('packing');
                /* Packing siempre inicia cerrado; Thermo King (panel según checkbox junto a Fundo) también cerrado al entrar a esta ruta. */
                (function cerrarPanelesFormatoPackingInicio() {
                    var bp = document.getElementById('body-packing-panel');
                    var hp = document.querySelector('[data-target="body-packing-panel"]');
                    var bt = document.getElementById('body-thermoking-panel');
                    var ht = document.querySelector('[data-target="body-thermoking-panel"]');
                    if (bp) bp.style.display = 'none';
                    if (hp) {
                        hp.setAttribute('aria-expanded', 'false');
                        var chp = hp.querySelector('.chevron');
                        if (chp) chp.classList.remove('rotate');
                    }
                    if (bt) bt.style.display = 'none';
                    if (ht) {
                        ht.setAttribute('aria-expanded', 'false');
                        var cht = ht.querySelector('.chevron');
                        if (cht) cht.classList.remove('rotate');
                    }
                })();
                setTimeout(function () {
                    if (currentFechaPacking && currentEnsayoPacking) packingReaplicarBorradorSiHaySesion();
                    else packingInicializarBusquedaAutomatica();
                    refrescarOpcionesEnsayoDesdeCache();
                    /* Solo fecha: no copiar ensayo aquí (carrera con await getEnsayosPorFecha en el change de view_fecha). */
                    syncFechaEspejoSoloFechaDesdePrimario();
                    try { asegurarFechasMetaPackingVisibles(); } catch (eFmeta2) {}
                    scheduleActualizarBloqueoSelectEnsayoFormatoPacking();
                    scheduleActualizarBloqueoWrapperPackingPanelHoja();
                }, 0);
            } else if (view === 'recepcion-c5') {
                currentSidebarView = 'recepcion-c5';
                if (prevSidebar !== 'formato-packing' && prevSidebar !== 'recepcion-c5') {
                    document.querySelectorAll('.workscope-btn').forEach(function (b) { b.classList.remove('is-active'); });
                }
                aplicarRutaPackingLayout(true);
                applyMedicionMode('packing');
                setTimeout(function () {
                    if (currentFechaPacking && currentEnsayoPacking) packingReaplicarBorradorSiHaySesion();
                    else packingInicializarBusquedaAutomatica();
                    refrescarOpcionesEnsayoDesdeCache();
                    syncFechaEspejoSoloFechaDesdePrimario();
                    try { asegurarFechasMetaPackingVisibles(); } catch (eFmetaRc5) {}
                    scheduleActualizarBloqueoSelectEnsayoFormatoPacking();
                    scheduleActualizarBloqueoWrapperPackingPanelHoja();
                    try { applyRecepcionC5TemplatePrimerInputLock(); } catch (eRc5V) {}
                    try { scheduleThermokingProgressRefresh(); } catch (eSchRc5) {}
                    /* Segundo intento tras el change async de view_fecha: asegura lista de ensayos + espejo RC5 (evita select vacío). */
                    var fechaIn = document.getElementById('view_fecha');
                    var feR = fechaIn && fechaIn.value ? String(fechaIn.value).trim() : '';
                    if (feR) {
                        setTimeout(function () {
                            if (currentSidebarView !== 'recepcion-c5') return;
                            if (typeof setSpinnersCargandoEnsayos === 'function') setSpinnersCargandoEnsayos(true);
                            getEnsayosPorFecha(feR)
                                .then(function (res) {
                                    if (typeof renderOpcionesEnsayoPorEstado === 'function') renderOpcionesEnsayoPorEstado(feR, res);
                                })
                                .catch(function () {})
                                .finally(function () {
                                    if (typeof setSpinnersCargandoEnsayos === 'function') setSpinnersCargandoEnsayos(false);
                                });
                        }, 150);
                    }
                }, 0);
            } else {
                currentSidebarView = 'campo';
                aplicarRutaPackingLayout(false);
                if (selTipo && !selTipo.value) selTipo.value = 'visual';
                applyMedicionMode('field');
            }
            syncSubnavFromSelect();
            if (window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons();
        }

        if (cosechaForm) cosechaForm.style.display = showForm ? 'block' : 'none';
        if (historialView) historialView.style.display = (view === 'historial') ? 'block' : 'none';
        if (recomendacionesView) recomendacionesView.style.display = (view === 'recomendaciones') ? 'block' : 'none';
        if (view === 'historial') renderHistorial(true);
        if (view === 'campo' || view === 'nueva') {
            requestAnimationFrame(function () {
                var anchorCampo = document.getElementById('campo');
                if (anchorCampo) anchorCampo.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        }
        if (typeof actualizarBannerFormatoPacking === 'function') actualizarBannerFormatoPacking();
        scheduleActualizarBloqueoWrapperPackingPanelHoja();
        setRouteForView(view);
    }

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

    var formWrap = document.getElementById('cosecha-form');
    var viewHistorialEl = document.getElementById('view-historial');
    var viewRecomEl = document.getElementById('view-recomendaciones');
    document.addEventListener('click', (event) => {
        if (!sidebar.classList.contains('active')) return;
        if (sidebar.contains(event.target)) return;
        if (menuBtn && menuBtn.contains(event.target)) return;
        /* No cerrar mientras se usa el formulario (incl. packing) ni historial/recomendaciones; el resto del área principal cierra */
        if (formWrap && formWrap.contains(event.target)) return;
        if (viewHistorialEl && viewHistorialEl.contains(event.target)) return;
        if (viewRecomEl && viewRecomEl.contains(event.target)) return;
        sidebar.classList.remove('active');
    });

    document.querySelectorAll('.nav-link').forEach(a => {
        a.addEventListener('click', (e) => {
            e.preventDefault();
            const view = a.getAttribute('data-view');
            if (view) {
                setActiveView(view);
                if (sidebar && sidebar.classList.contains('active')) sidebar.classList.remove('active');
            }
        });
    });

    (function bindPackingNavParentToggle() {
        var btn = document.getElementById('nav_btn_packing_desglose');
        var sub = document.getElementById('subnav_packing_desglose');
        if (!btn || !sub) return;
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            var grp = document.getElementById('sidebar_nav_group_packing');
            var open = grp && grp.classList.contains('sidebar-nav-group--open');
            var next = !open;
            setPackingSubnavOpen(next);
            writePackingAccordionOpen(next);
            if (window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons();
        });
    })();

    function aplicarRutaDesdeHash() {
        var hash = (window.location.hash || '').replace(/^#/, '').trim();
        if (!hash) {
            try {
                var saved = sessionStorage.getItem('tiempos_last_route');
                if (saved && { campo: true, 'formato-packing': true, 'recepcion-c5': true, historial: true, recomendaciones: true, nueva: true }[saved]) {
                    history.replaceState(null, '', '#' + saved);
                    hash = saved;
                }
            } catch (_) {}
        }
        if (!hash) return;
        var permitidas = { campo: true, 'formato-packing': true, 'recepcion-c5': true, historial: true, recomendaciones: true, nueva: true };
        if (!permitidas[hash]) return;
        setActiveView(hash);
    }
    aplicarRutaDesdeHash();
    syncSubnavFromSelect();
    setPackingSubnavOpen(readPackingAccordionOpen());
    window.addEventListener('hashchange', function () {
        aplicarRutaDesdeHash();
        syncSubnavFromSelect();
    });

    // --- Validaciones de entrada y fecha local ---
    const trazLibre = document.getElementById('reg_traz_libre');
    if (trazLibre) {
        trazLibre.addEventListener('input', function() {
            this.value = this.value.toUpperCase();
        });
    }

    const campoFecha = document.getElementById('reg_fecha');
    // reg_fecha y campos packing: ya aplicados en aplicarValoresFechaHoraPorDefecto() al iniciar
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

        let items = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
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
        const items = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') || [];
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

    function showFullscreenLoader(text) {
        const loader = document.getElementById('fullscreen-loader');
        if (!loader) return;
        const txt = loader.querySelector('.fullscreen-loader-text');
        if (txt && text) txt.textContent = text;
        loader.classList.add('is-visible');
    }
    function hideFullscreenLoader() {
        const loader = document.getElementById('fullscreen-loader');
        if (!loader) return;
        loader.classList.remove('is-visible');
    }
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    document.getElementById('historial-btn-refresh')?.addEventListener('click', async () => {
        const started = Date.now();
        showFullscreenLoader('Cargando registros...');
        try {
            await renderHistorial(true);
            const elapsed = Date.now() - started;
            if (elapsed < 800) await delay(800 - elapsed);
        } finally {
            hideFullscreenLoader();
        }
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
        acopio: {
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

    if (isVistaPackingSidebar()) {
        tipoActual = 'packing';
    } else if (selectMedicion && selectMedicion.value) {
        tipoActual = selectMedicion.value;
    }

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
    /** Validación tiempos muestra: Inicio ≤ Pérdida ≤ Término ≤ Llegada ≤ Despacho. Cualquier hora posterior debe ser >= cualquier anterior (también si hay campos vacíos en medio). */
    function validarTiemposMuestraOrden(data) {
        var orden = [
            (data.inicio || '').trim(),
            (data.perdida || '').trim(),
            (data.termino || '').trim(),
            (data.llegada || '').trim(),
            (data.despacho || '').trim()
        ];
        var nombres = ['Inicio', 'Pérdida', 'Término', 'Llegada', 'Despacho'];
        for (var i = 0; i < orden.length; i++) {
            for (var j = i + 1; j < orden.length; j++) {
                if (orden[i] && orden[j] && !tiempoMenorOIgual(orden[i], orden[j])) {
                    return { ok: false, msg: nombres[i] + ' ≤ ' + nombres[j] + ' (' + nombres[j] + ' debe ser mayor o igual).' };
                }
            }
        }
        return { ok: true };
    }
    /** Para la misma N° Jarra: término Cosecha debe ser <= inicio Traslado (Traslado nunca antes que fin de Cosecha). Traslado "1-2" aplica a jarras 1 y 2. */
    function idsDeJarraTraslado(jarraStr) {
        var n = (v) => (v == null || v === '') ? '' : String(v).trim();
        var s = n(jarraStr);
        if (s.indexOf('-') >= 0) return s.split('-').map(function (x) { return n(x); }).filter(Boolean);
        return s ? [s] : [];
    }
    function validarOrdenCosechaTrasladoJarras(jarras) {
        var norm = function (v) { return (v == null || v === '') ? '' : String(v).trim(); };
        for (var i = 0; i < jarras.length; i++) {
            var t = jarras[i];
            if (t.tipo !== 'T') continue;
            var trasladoInicio = (t.inicio || '').trim();
            if (!trasladoInicio) continue;
            var idsT = idsDeJarraTraslado(t.jarra);
            for (var j = 0; j < jarras.length; j++) {
                var c = jarras[j];
                if (c.tipo !== 'C') continue;
                var cJarra = norm(c.jarra);
                if (!cJarra) continue;
                var aplica = idsT.length === 0 ? (norm(t.jarra) === cJarra) : (idsT.indexOf(cJarra) >= 0);
                if (!aplica) continue;
                var cosechaTermino = (c.termino || '').trim();
                if (!cosechaTermino) continue;
                if (!tiempoMenorOIgual(cosechaTermino, trasladoInicio)) {
                    return { ok: false, msg: 'El inicio de Traslado (' + trasladoInicio + ') debe ser igual o posterior al término de Cosecha (' + cosechaTermino + ') para la N° Jarra ' + cJarra + '.' };
                }
            }
        }
        return { ok: true };
    }
    /** Devuelve la hora TÉRMINO de Cosecha para esa jarra (o para "1-2" la más tarde de las dos). Si no hay Cosecha, devuelve ''. */
    function getTerminoCosechaParaJarra(ensayo, jarra) {
        var dc = (tipoActual === 'visual' || tipoActual === 'acopio') ? datosEnsayos[tipoActual] : null;
        if (!ensayo || !jarra || !dc || !dc[ensayo]) return '';
        var list = dc[ensayo].jarras || [];
        var ids = idsDeJarraTraslado(jarra);
        if (ids.length === 0) ids = [('' + jarra).trim()].filter(Boolean);
        var terminos = [];
        for (var i = 0; i < list.length; i++) {
            if (list[i].tipo !== 'C') continue;
            var j = ('' + (list[i].jarra || '')).trim();
            if (ids.indexOf(j) < 0) continue;
            var t = (list[i].termino || '').trim();
            if (t) terminos.push(t);
        }
        if (terminos.length === 0) return '';
        if (terminos.length === 1) return terminos[0];
        terminos.sort(function (a, b) { return tiempoEnMinutos(a) - tiempoEnMinutos(b); });
        return terminos[terminos.length - 1];
    }
    /** Si TIPO es Traslado y N° JARRA tiene Cosecha, rellena INICIO con el TÉRMINO de Cosecha. */
    function llenarInicioTrasladoSegunCosecha() {
        var tipoEl = document.getElementById('reg_jarras_tipo');
        var jarraEl = document.getElementById('reg_jarras_n_jarra');
        var inicioEl = document.getElementById('reg_jarras_inicio');
        if (!tipoEl || !jarraEl || !inicioEl) return;
        var tipo = (tipoEl.value || '').trim();
        var jarra = (jarraEl.value || '').trim();
        if (tipo !== 'T' || !jarra) return;
        var terminoCosecha = getTerminoCosechaParaJarra(ensayoActual, jarra);
        if (terminoCosecha) inicioEl.value = terminoCosecha;
    }
    /** IDs únicos de N° JARRA solo de filas con TIPO Cosecha (para el select de Traslado). */
    function getJarrasCosechaIds(ensayo) {
        var dc = (tipoActual === 'visual' || tipoActual === 'acopio') ? datosEnsayos[tipoActual] : null;
        if (!ensayo || !dc || !dc[ensayo]) return [];
        var list = dc[ensayo].jarras || [];
        var ids = [];
        var seen = {};
        for (var i = 0; i < list.length; i++) {
            if (list[i].tipo !== 'C') continue;
            var id = (list[i].jarra != null && list[i].jarra !== '') ? String(list[i].jarra).trim() : '';
            if (id && !seen[id]) { seen[id] = true; ids.push(id); }
        }
        ids.sort(function (a, b) { return (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0) || a.localeCompare(b); });
        return ids;
    }
    /** Jarras que tienen Cosecha pero aún no Traslado (para poder elegir al agregar Traslado). Recorre la lista directamente para no perder ninguna. */
    function getJarrasSinTraslado(ensayo) {
        var dc = (tipoActual === 'visual' || tipoActual === 'acopio') ? datosEnsayos[tipoActual] : null;
        if (!ensayo || !dc || !dc[ensayo]) return [];
        var list = dc[ensayo].jarras || [];
        var conCosecha = {};
        var conTraslado = {};
        for (var i = 0; i < list.length; i++) {
            var j = ('' + (list[i].jarra || '')).trim();
            if (!j) continue;
            if (list[i].tipo === 'C') {
                if (j.indexOf('-') < 0) conCosecha[j] = true;
            }
            if (list[i].tipo === 'T') {
                if (j.indexOf('-') >= 0) {
                    var partes = j.split('-').map(function (x) { return (x || '').trim(); });
                    partes.forEach(function (p) { if (p) conTraslado[p] = true; });
                } else conTraslado[j] = true;
            }
        }
        var out = [];
        for (var k in conCosecha) { if (conCosecha[k] && !conTraslado[k]) out.push(k); }
        out.sort(function (a, b) { return (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0); });
        return out;
    }
    /** Opciones para el select N° JARRA según TIPO. Cosecha = jarras sin Cosecha + jarras sin Traslado (para poder elegir y agregar Traslado) + siguiente. Así al eliminar Traslado de 1 y 2 vuelven a salir 1 y 2. Traslado = solo jarras sin Traslado. */
    function getOpcionesJarra(ensayo, tipo) {
        var ids = getJarrasCosechaIds(ensayo);
        var maxN = ids.length ? Math.max.apply(null, ids.map(function (x) { return parseInt(x, 10) || 0; })) : 0;
        var siguiente = String(maxN + 1);
        tipo = (tipo || '').trim();
        if (tipo === 'C') {
            var listC = [];
            for (var n = 1; n <= maxN; n++) {
                var s = String(n);
                if (ids.indexOf(s) < 0) listC.push(s);
            }
            for (var i = 0; i < ids.length; i++) {
                if (!jarraYaTieneTraslado(ensayo, ids[i]) && listC.indexOf(ids[i]) < 0) listC.push(ids[i]);
            }
            var sinTraslado = getJarrasSinTraslado(ensayo);
            for (var j = 0; j < sinTraslado.length; j++) {
                if (listC.indexOf(sinTraslado[j]) < 0) listC.push(sinTraslado[j]);
            }
            if (listC.indexOf(siguiente) < 0) listC.push(siguiente);
            listC.sort(function (a, b) { return (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0); });
            return listC;
        }
        if (tipo === 'T') {
            var sinTraslado = getJarrasSinTraslado(ensayo);
            if (sinTraslado.length === 0) return [siguiente];
            return sinTraslado;
        }
        var list = getJarrasSinTraslado(ensayo).slice();
        if (list.indexOf(siguiente) < 0) list.push(siguiente);
        list.sort(function (a, b) { return (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0); });
        return list;
    }
    /** True si esa jarra (número solo, no "1-2") ya tiene una fila Cosecha registrada. */
    function jarraYaTieneCosecha(ensayo, jarra) {
        if (!ensayo || !jarra || ('' + jarra).indexOf('-') >= 0) return false;
        var dc = (tipoActual === 'visual' || tipoActual === 'acopio') ? datosEnsayos[tipoActual] : null;
        var list = (dc && dc[ensayo] && dc[ensayo].jarras) ? dc[ensayo].jarras : [];
        var n = ('' + jarra).trim();
        for (var i = 0; i < list.length; i++) {
            if (list[i].tipo === 'C' && ('' + (list[i].jarra || '')).trim() === n) return true;
        }
        return false;
    }
    /** True si esa jarra ya tiene Cosecha y Traslado registrados. Traslado "1-2" cuenta como Traslado para jarra 1 y para jarra 2 (equivale a uno por uno). */
    function jarraYaCompleta(ensayo, jarraId) {
        if (!ensayo || jarraId == null || jarraId === '' || ('' + jarraId).indexOf('-') >= 0) return false;
        var dc = (tipoActual === 'visual' || tipoActual === 'acopio') ? datosEnsayos[tipoActual] : null;
        var list = (dc && dc[ensayo] && dc[ensayo].jarras) ? dc[ensayo].jarras : [];
        var n = ('' + jarraId).trim();
        var tieneC = false, tieneT = false;
        for (var i = 0; i < list.length; i++) {
            var j = ('' + (list[i].jarra || '')).trim();
            if (list[i].tipo === 'C' && j === n) tieneC = true;
            if (list[i].tipo === 'T') {
                if (j === n) tieneT = true;
                else if (j.indexOf('-') >= 0) {
                    var partes = j.split('-').map(function (x) { return (x || '').trim(); });
                    if (partes.indexOf(n) >= 0) tieneT = true;
                }
            }
        }
        return tieneC && tieneT;
    }
    /** True si esa jarra ya tiene al menos una fila Traslado (individual o en grupo "1-2" que la incluya). */
    function jarraYaTieneTraslado(ensayo, jarraId) {
        if (!ensayo || jarraId == null || jarraId === '') return false;
        var dc = (tipoActual === 'visual' || tipoActual === 'acopio') ? datosEnsayos[tipoActual] : null;
        var list = (dc && dc[ensayo] && dc[ensayo].jarras) ? dc[ensayo].jarras : [];
        var n = ('' + jarraId).trim();
        for (var i = 0; i < list.length; i++) {
            if (list[i].tipo !== 'T') continue;
            var j = ('' + (list[i].jarra || '')).trim();
            if (j === n) return true;
            if (j.indexOf('-') >= 0) {
                var partes = j.split('-').map(function (x) { return (x || '').trim(); });
                if (partes.indexOf(n) >= 0) return true;
            }
        }
        return false;
    }
    /** True si ya existe una fila de Traslado con ese valor grupal (ej. "1-2"). Así no se ofrece de nuevo en el desplegable. */
    function yaExisteTrasladoGrupal(ensayo, valorGrupal) {
        if (!ensayo || !valorGrupal || ('' + valorGrupal).indexOf('-') < 0) return false;
        var dc = (tipoActual === 'visual' || tipoActual === 'acopio') ? datosEnsayos[tipoActual] : null;
        var list = (dc && dc[ensayo] && dc[ensayo].jarras) ? dc[ensayo].jarras : [];
        var v = ('' + valorGrupal).trim();
        for (var i = 0; i < list.length; i++) {
            if (list[i].tipo === 'T' && ('' + (list[i].jarra || '')).trim() === v) return true;
        }
        return false;
    }
    /** TIPO dinámico: Cosecha siempre primero; Traslado solo si esa jarra ya tiene Cosecha (no se puede registrar Traslado antes que Cosecha). */
    function actualizarTipoSegunJarra() {
        var jarraEl = document.getElementById('reg_jarras_n_jarra');
        var tipoEl = document.getElementById('reg_jarras_tipo');
        if (!jarraEl || !tipoEl) return;
        var valorTipoAnterior = (tipoEl.value || '').trim();
        var jarra = (jarraEl.value || '').trim();
        var mostrarCosecha = false;
        var mostrarTraslado = false;
        if (jarra) {
            if (jarra.indexOf('-') >= 0) {
                mostrarTraslado = true;
            } else {
                var yaTieneCosecha = jarraYaTieneCosecha(ensayoActual, jarra);
                mostrarCosecha = !yaTieneCosecha;
                mostrarTraslado = yaTieneCosecha && !jarraYaTieneTraslado(ensayoActual, jarra);
            }
        } else {
            mostrarCosecha = true;
            mostrarTraslado = false;
        }
        tipoEl.innerHTML = '';
        var opt0 = document.createElement('option');
        opt0.value = '';
        opt0.textContent = 'Selecciona...';
        opt0.disabled = true;
        tipoEl.appendChild(opt0);
        if (mostrarCosecha) {
            var optC = document.createElement('option');
            optC.value = 'C';
            optC.textContent = 'Cosecha';
            tipoEl.appendChild(optC);
        }
        if (mostrarTraslado) {
            var optT = document.createElement('option');
            optT.value = 'T';
            optT.textContent = 'Traslado';
            tipoEl.appendChild(optT);
        }
        if (mostrarCosecha && !mostrarTraslado) {
            tipoEl.value = 'C';
        } else if (!mostrarCosecha && mostrarTraslado) {
            tipoEl.value = 'T';
        } else if (valorTipoAnterior === 'C' && mostrarCosecha) {
            tipoEl.value = 'C';
        } else if (valorTipoAnterior === 'T' && mostrarTraslado) {
            tipoEl.value = 'T';
        } else {
            opt0.selected = true;
        }
    }
    /** N° JARRA siempre es un select dinámico: opciones según TIPO; si hay 2+ jarras con Cosecha sin Traslado añade siempre 1-2, 2-3… (viaje grupal) aunque TIPO sea Cosecha, para que al eliminar Traslados vuelva a salir. No limpia el valor al cambiar TIPO. */
    function actualizarCampoNJarraSegunTipo() {
        var td = document.getElementById('td_jarras_n_jarra');
        var tipoEl = document.getElementById('reg_jarras_tipo');
        if (!td || !tipoEl) return;
        var tipo = (tipoEl.value || '').trim();
        var ids = getOpcionesJarra(ensayoActual, tipo);
        var idsConCosechaSinTraslado = getJarrasSinTraslado(ensayoActual);
        var valorActual = '';
        var elActual = document.getElementById('reg_jarras_n_jarra');
        if (elActual && elActual.tagName === 'SELECT') valorActual = (elActual.value || '').trim();

        var html = '<select id="reg_jarras_n_jarra" name="reg_jarras_n_jarra" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; box-sizing: border-box;"><option value="">Selecciona...</option>';
        for (var k = 0; k < ids.length; k++) {
            html += '<option value="' + ids[k] + '">' + ids[k] + '</option>';
        }
        if (idsConCosechaSinTraslado.length >= 2) {
            for (var i = 0; i < idsConCosechaSinTraslado.length - 1; i++) {
                var valorGrupal = idsConCosechaSinTraslado[i] + '-' + idsConCosechaSinTraslado[i + 1];
                if (!yaExisteTrasladoGrupal(ensayoActual, valorGrupal)) {
                    html += '<option value="' + valorGrupal + '">' + valorGrupal + ' (viaje grupal)</option>';
                }
            }
        }
        html += '</select>';
        td.innerHTML = html;
        var sel = document.getElementById('reg_jarras_n_jarra');
        if (sel && valorActual) {
            var opcionExiste = [].slice.call(sel.options).some(function (o) { return o.value === valorActual; });
            if (opcionExiste) sel.value = valorActual;
        }
        sel = document.getElementById('reg_jarras_n_jarra');
        if (sel) sel.addEventListener('change', function () { actualizarTipoSegunJarra(); llenarInicioTrasladoSegunCosecha(); });
        actualizarTipoSegunJarra();
        setTimeout(function () { llenarInicioTrasladoSegunCosecha(); }, 0);
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
            
            if (this.value === 'visual' || this.value === 'acopio') {
                currentSidebarView = 'campo';
                aplicarRutaPackingLayout(false);
                applyMedicionMode('field');
                setRouteForView('campo');
            }
            
            if (ensayoActual) {
                restaurarDatosEnsayo(tipoActual, ensayoActual);
            }
            syncSubnavFromSelect();
        });
    }

    function guardarFormHeaderEnEnsayo(ensayo) {
        if (!ensayo || (tipoActual !== 'visual' && tipoActual !== 'acopio')) return;
        if (!datosEnsayos[tipoActual][ensayo]) return;
        const el = function(id) { var e = document.getElementById(id); return e ? (e.value || '').trim() : ''; };
        datosEnsayos[tipoActual][ensayo].formHeader = {
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
        if (!ensayo || (tipoActual !== 'visual' && tipoActual !== 'acopio') || !datosEnsayos[tipoActual][ensayo]) return;
        const h = datosEnsayos[tipoActual][ensayo].formHeader;
        function set(id, val) { var e = document.getElementById(id); if (e) e.value = val != null ? val : ''; }
        if (h) {
            if (h.fecha) setNativeDateValue(document.getElementById('reg_fecha'), h.fecha);
            else setNativeDateValue(document.getElementById('reg_fecha'), fechaLocalHoy());
            set('reg_responsable', (h.responsable != null && String(h.responsable).trim() !== '') ? String(h.responsable).trim() : RESPONSABLE_CAMPO_PREDETERMINADO);
            set('reg_guia_remision', h.guia_remision);
            set('reg_variedad', h.variedad);
            set('reg_placa', h.placa);
            var hi = document.getElementById('reg_hora_inicio');
            if (hi) setNativeTimeValue(hi, h.hora_inicio || '07:15');
            set('reg_dias_precosecha', h.dias_precosecha);
            set('reg_traz_libre', h.traz_libre);
            set('reg_fundo', normalizarValorFundoSelect(h.fundo));
            sincronizarTrazabilidadRegCampo({ trazEtapa: h.traz_etapa, trazCampo: h.traz_campo });
            set('reg_observacion_formato', h.observacion);
        } else {
            /* Ensayo sin cabecera guardada: no vaciar fecha; mantener la del campo o hoy por defecto */
            var rf0 = document.getElementById('reg_fecha');
            var fechaMantener = rf0 && String(rf0.value || '').trim();
            setNativeDateValue(rf0, fechaMantener || fechaLocalHoy());
            set('reg_responsable', RESPONSABLE_CAMPO_PREDETERMINADO);
            set('reg_guia_remision', '');
            set('reg_variedad', '');
            set('reg_placa', '');
            var hi2 = document.getElementById('reg_hora_inicio');
            if (hi2) setNativeTimeValue(hi2, '07:15');
            set('reg_dias_precosecha', '');
            set('reg_traz_libre', '');
            set('reg_fundo', '');
            sincronizarTrazabilidadRegCampo({});
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

    (function bindTrazabilidadFundoEtapaCampo() {
        var regFundo = document.getElementById('reg_fundo');
        var regEtapa = document.getElementById('reg_traz_etapa');
        if (regFundo) {
            regFundo.addEventListener('change', function () {
                sincronizarTrazabilidadRegCampo({});
                try { window.formHasChanges = true; } catch (_) {}
            });
        }
        if (regEtapa) {
            regEtapa.addEventListener('change', function () {
                regRefrescarCampoDesdeEtapaActual();
                try { window.formHasChanges = true; } catch (_) {}
            });
        }
        sincronizarTrazabilidadRegCampo({});
    })();

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

    var spinnerEnsayos = document.getElementById('spinner_ensayos');
    var spinnerEnsayosRc5 = document.getElementById('spinner_ensayos_rc5');
    var rowFechaEnsayoPacking = document.querySelector('.packing-fecha-ensayo-row--solo-packing');
    var rowFechaEnsayoRc5 = document.querySelector('.packing-fecha-ensayo-row--solo-rc5');
    function rowFechaEnsayoActivo() {
        return currentSidebarView === 'recepcion-c5' ? rowFechaEnsayoRc5 : rowFechaEnsayoPacking;
    }
    var sectionDatos = document.getElementById('packing_datos_section');
    var msgNoEnsayos = document.getElementById('view_no_ensayos_msg');
    var msgNoEnsayosRc5 = document.getElementById('view_no_ensayos_msg_rc5');
    var rc5ResumenPanel = document.getElementById('rc5_resumen_ensayos_panel');
    function escapeHtmlRc5(t) {
        return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function actualizarPanelResumenRc5(fecha, res) {
        if (!rc5ResumenPanel) return;
        if (currentSidebarView !== 'recepcion-c5' || !res || !res.ok || !res.ensayos || res.ensayos.length === 0) {
            rc5ResumenPanel.style.display = 'none';
            rc5ResumenPanel.innerHTML = '';
            return;
        }
        var badgeRc5Cell = function (on) {
            return '<span class="rc5-badge ' + (on ? 'rc5-badge--ok' : 'rc5-badge--no') + '">' + (on ? '✓' : '✗') + '</span>';
        };
        var rows = '';
        for (var ir = 0; ir < res.ensayos.length; ir++) {
            var n = res.ensayos[ir];
            var vis = flagEnsayoEnMap_(visualRegistroPorFecha[fecha], n);
            var pk = flagEnsayoEnMap_(packingYaEnviadoPorFecha[fecha], n);
            var tk = flagEnsayoEnMap_(thermoKingYaEnviadoPorFecha[fecha], n);
            var c5 = flagEnsayoEnMap_(recepcionC5YaEnviadoPorFecha[fecha], n);
            rows += '<tr><td>Ensayo ' + escapeHtmlRc5(n) + '</td><td>' + badgeRc5Cell(vis) + '</td><td>' + badgeRc5Cell(pk) + '</td><td>' + badgeRc5Cell(tk) + '</td><td>' + badgeRc5Cell(c5) + '</td></tr>';
        }
        rc5ResumenPanel.innerHTML = '<p class="rc5-resumen-ensayos__title">Estado en hoja por ensayo</p><div class="rc5-resumen-ensayos__table-wrap"><table class="rc5-resumen-ensayos__table rc5-resumen-ensayos__table--full"><thead><tr><th scope="col">Ensayo</th><th scope="col">Visual</th><th scope="col">Packing A9</th><th scope="col">Thermo King</th><th scope="col">Recepción C5</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
        rc5ResumenPanel.style.display = 'block';
    }
    var visualRegistroPorFecha = {};
    var packingYaEnviadoPorFecha = {};
    var recepcionC5YaEnviadoPorFecha = {};
    var thermoKingYaEnviadoPorFecha = {};
    var cacheEnsayosParaSelect = { fecha: '', res: null };
    var packingBloqueadoParaActual = false;
    var packingEnviando = false; // true mientras se envía packing (mantiene botón deshabilitado)
    var thermokingUsarCamaraMP = null; // null=sin decidir, true=si, false=no
    /** Transición de Fundo para marcar solo al pasar a A9 (checkbox Thermo King). */
    var prevFundoParaTkOptin = '';
    /** True solo tras «Cargar datos» (GET) y aplicarDatosVistaPacking; habilita el checkbox Thermo King junto a Fundo. */
    var packingDatosCampoCargados = false;
    var numFilasEsperadoPorFechaEnsayo = {};
    function flagEnsayoEnMap_(map, n) {
        if (!map || typeof map !== 'object') return false;
        var s = String(n);
        if (map[s] === true) return true;
        if (map[n] === true) return true;
        return false;
    }

    /** Packing ya guardado en hoja según último GET de ensayos (ensayosConPacking); no usa borrador local. */
    function ensayoPackingYaEnHojaSegunServidor_(fecha, ensayoNum) {
        if (!fecha || ensayoNum === '' || ensayoNum == null) return false;
        var res = cacheEnsayosParaSelect.res;
        if (!res || !res.ok || cacheEnsayosParaSelect.fecha !== fecha) return false;
        return flagEnsayoEnMap_(res.ensayosConPacking, ensayoNum);
    }

    function toastPackingPanelBloqueadoPorHoja_() {
        if (typeof Swal === 'undefined') return;
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'info',
            title: 'Ya tenemos datos en packing en el sistema. Panel bloqueado.',
            showConfirmButton: false,
            timer: 3800,
            timerProgressBar: true
        });
    }

    var rafBloqueoWrapperPackingHoja = null;
    function scheduleActualizarBloqueoWrapperPackingPanelHoja() {
        if (rafBloqueoWrapperPackingHoja != null) return;
        rafBloqueoWrapperPackingHoja = requestAnimationFrame(function () {
            rafBloqueoWrapperPackingHoja = null;
            actualizarBloqueoWrapperPackingPanelHoja();
        });
    }

    /** #formato-packing: si el servidor marca packing en hoja, cierra el panel y marca wrapper (no abrir). */
    function actualizarBloqueoWrapperPackingPanelHoja() {
        var wrap = document.getElementById('wrapper_packing_panel');
        if (!wrap) return;
        var head = wrap.querySelector('.collapsible-toggle[data-target="body-packing-panel"]');
        var fe = inputFechaPacking && inputFechaPacking.value ? inputFechaPacking.value.trim() : '';
        var en = selEnsayoPacking && selEnsayoPacking.value ? String(selEnsayoPacking.value).trim() : '';
        var bloquear = typeof currentSidebarView !== 'undefined' && currentSidebarView === 'formato-packing'
            && ensayoPackingYaEnHojaSegunServidor_(fe, en);
        if (bloquear) {
            wrap.classList.add('packing-panel--bloqueado-hoja');
            if (head) {
                head.setAttribute('aria-disabled', 'true');
                head.setAttribute('title', 'Ya tenemos datos en packing en el sistema. Panel bloqueado.');
            }
            if (typeof cerrarCollapsible === 'function') cerrarCollapsible('body-packing-panel');
        } else {
            wrap.classList.remove('packing-panel--bloqueado-hoja');
            if (head) {
                head.removeAttribute('aria-disabled');
                head.removeAttribute('title');
            }
        }
    }

    /** Marca Packing / C5 / TK en memoria (borrador) para reflejar ✓ en panel y select sin esperar otro GET. */
    function aplicarEstadoBorradorLocalRc5(fecha) {
        if (!fecha) return;
        if (!packingYaEnviadoPorFecha[fecha]) packingYaEnviadoPorFecha[fecha] = {};
        if (!recepcionC5YaEnviadoPorFecha[fecha]) recepcionC5YaEnviadoPorFecha[fecha] = {};
        if (!thermoKingYaEnviadoPorFecha[fecha]) thermoKingYaEnviadoPorFecha[fecha] = {};
        var prefix = fecha + '_';
        var k;
        for (k in datosPackingPorEnsayo) {
            if (!Object.prototype.hasOwnProperty.call(datosPackingPorEnsayo, k)) continue;
            if (k.indexOf(prefix) !== 0) continue;
            var ens = k.slice(prefix.length);
            if (!ens) continue;
            var st = datosPackingPorEnsayo[k];
            try {
                if (getPackingRowCountFromStored(st) > 0) packingYaEnviadoPorFecha[fecha][ens] = true;
                if (tieneDatosC5ParaEnviar(st)) recepcionC5YaEnviadoPorFecha[fecha][ens] = true;
                if (tieneDatosThermokingParaEnviar(st)) thermoKingYaEnviadoPorFecha[fecha][ens] = true;
            } catch (_) {}
        }
        try {
            if (!datosEnsayos) return;
            for (var e = 1; e <= 4; e++) {
                ['visual', 'acopio'].forEach(function (tipo) {
                    var block = datosEnsayos[tipo] && datosEnsayos[tipo][e];
                    if (!block || !block.formHeader || !block.formHeader.fecha) return;
                    if (String(block.formHeader.fecha).trim() !== fecha) return;
                    if (block.visual && block.visual.length > 0) {
                        if (!visualRegistroPorFecha[fecha]) visualRegistroPorFecha[fecha] = {};
                        visualRegistroPorFecha[fecha][String(e)] = true;
                    }
                });
            }
        } catch (_) {}
    }

    var rafRefrescarRc5Ui = null;
    function scheduleRefrescarUiEstadoRc5() {
        if (rafRefrescarRc5Ui != null) return;
        rafRefrescarRc5Ui = requestAnimationFrame(function () {
            rafRefrescarRc5Ui = null;
            refrescarUiEstadoRc5();
        });
    }

    /** Panel + textos del select + banner: estado servidor + borrador local; Visual ✓ si el ensayo está en la lista (fila en hoja). */
    function refrescarUiEstadoRc5() {
        try {
            if (typeof currentSidebarView === 'undefined' || currentSidebarView !== 'recepcion-c5') return;
            var fecha = inputFechaPacking && inputFechaPacking.value ? String(inputFechaPacking.value).trim() : '';
            var res = cacheEnsayosParaSelect.res;
            if (!fecha || !res || !res.ok || !res.ensayos || res.ensayos.length === 0) return;
            if (cacheEnsayosParaSelect.fecha !== fecha) return;
            if (!visualRegistroPorFecha[fecha]) visualRegistroPorFecha[fecha] = {};
            res.ensayos.forEach(function (nv) {
                visualRegistroPorFecha[fecha][String(nv)] = true;
            });
            aplicarEstadoBorradorLocalRc5(fecha);
            actualizarPanelResumenRc5(fecha, res);
            if (!selEnsayoPacking) return;
            var b = function (on) { return on ? '✓' : '✗'; };
            for (var oi = 0; oi < selEnsayoPacking.options.length; oi++) {
                var op = selEnsayoPacking.options[oi];
                var n = op.value;
                if (!n) continue;
                var tieneVis = flagEnsayoEnMap_(visualRegistroPorFecha[fecha], n);
                var tienePacking = flagEnsayoEnMap_(packingYaEnviadoPorFecha[fecha], n);
                var tieneC5 = flagEnsayoEnMap_(recepcionC5YaEnviadoPorFecha[fecha], n);
                var tieneTK = flagEnsayoEnMap_(thermoKingYaEnviadoPorFecha[fecha], n);
                op.textContent = 'Ensayo ' + n + ' · Vis ' + b(tieneVis) + ' · Pk ' + b(tienePacking) + ' · TK ' + b(tieneTK) + ' · C5 ' + b(tieneC5);
            }
            actualizarBannerRecepcionC5();
        } catch (err) {
            if (typeof console !== 'undefined' && console.warn) console.warn('refrescarUiEstadoRc5', err);
        }
    }

    /** #formato-packing: texto según GET (mapas) para Packing y Thermo King del ensayo elegido. */
    function actualizarBannerFormatoPacking() {
        var el = document.getElementById('formato_packing_estado_hoja');
        if (!el) return;
        if (typeof currentSidebarView === 'undefined' || currentSidebarView !== 'formato-packing') {
            el.textContent = '';
            el.style.display = 'none';
            return;
        }
        try { actualizarOpcionesPackingModoEnvioSelect(); } catch (eFmtSelBanner) {}
        el.style.display = 'block';
        var fecha = (inputFechaPacking && inputFechaPacking.value) ? inputFechaPacking.value.trim() : '';
        var n = (selEnsayoPacking && selEnsayoPacking.value) ? String(selEnsayoPacking.value).trim() : '';
        if (!fecha) {
            el.textContent = '';
            el.style.display = 'none';
            return;
        }
        if (!n) {
            el.textContent = 'Elija un ensayo: el listado muestra si ya hay Packing (Pk) y Thermo King (TK) en la hoja. Si ambos están completos para un ensayo, ese ensayo no se puede volver a elegir y el selector se bloquea al tenerlo seleccionado.';
            return;
        }
        var pk = flagEnsayoEnMap_(packingYaEnviadoPorFecha[fecha], n);
        var tk = flagEnsayoEnMap_(thermoKingYaEnviadoPorFecha[fecha], n);
        function txt(on) { return on ? 'sí' : 'no'; }
        var base = 'Ensayo ' + n + ' — Packing en hoja: ' + txt(pk) + ' · Thermo King en hoja: ' + txt(tk) + '.';
        if (cacheEnsayosParaSelect.fecha === fecha && cacheEnsayosParaSelect.res && cacheEnsayosParaSelect.res.ok && ensayoServidorTieneFormatoPackingCompleto(fecha, n)) {
            el.textContent = base + ' Formato completo en hoja: el selector de ensayo queda bloqueado.';
        } else {
            el.textContent = base;
        }
    }

    function actualizarBannerRecepcionC5() {
        var el = document.getElementById('recepcion_c5_estado_hoja');
        if (!el) return;
        if (currentSidebarView !== 'recepcion-c5') {
            el.textContent = '';
            return;
        }
        var fecha = (inputFechaPacking && inputFechaPacking.value) ? inputFechaPacking.value.trim() : '';
        var n = (selEnsayoPacking && selEnsayoPacking.value) ? String(selEnsayoPacking.value).trim() : '';
        if (!fecha) {
            el.textContent = '';
            return;
        }
        if (!n) {
            el.textContent = 'Elija un ensayo: la tabla resume Visual, Packing, Thermo King y Recepción C5 en hoja. «Cargar datos» usa la fila de esa fecha y ensayo.';
            return;
        }
        var vis = flagEnsayoEnMap_(visualRegistroPorFecha[fecha], n);
        var pk = flagEnsayoEnMap_(packingYaEnviadoPorFecha[fecha], n);
        var tk = flagEnsayoEnMap_(thermoKingYaEnviadoPorFecha[fecha], n);
        var c5 = flagEnsayoEnMap_(recepcionC5YaEnviadoPorFecha[fecha], n);
        function txt(on) { return on ? 'sí' : 'no'; }
        el.textContent = 'Ensayo ' + n + ' — Visual: ' + txt(vis) + ' · Packing: ' + txt(pk) + ' · Thermo King: ' + txt(tk) + ' · Recepción C5: ' + txt(c5) + '.';
    }

    function refrescarOpcionesEnsayoDesdeCache() {
        var fe = inputFechaPacking && inputFechaPacking.value ? inputFechaPacking.value.trim() : '';
        if (!fe || !cacheEnsayosParaSelect.res || cacheEnsayosParaSelect.fecha !== fe) return;
        var prev = selEnsayoPacking ? selEnsayoPacking.value : '';
        renderOpcionesEnsayoPorEstado(fe, cacheEnsayosParaSelect.res);
        if (prev && selEnsayoPacking) {
            var tienePrev = Array.from(selEnsayoPacking.options).some(function (o) { return o.value === prev; });
            if (tienePrev) {
                selEnsayoPacking.value = prev;
                currentEnsayoPacking = prev;
                currentFechaPacking = fe;
            }
        }
        syncFechaEnsayoEspejoDesdePrimario();
    }

    function setSpinnersCargandoEnsayos(visible) {
        if (currentSidebarView === 'recepcion-c5') {
            if (spinnerEnsayosRc5) spinnerEnsayosRc5.style.display = visible ? 'inline-block' : 'none';
            if (spinnerEnsayos) spinnerEnsayos.style.display = 'none';
        } else {
            if (spinnerEnsayos) spinnerEnsayos.style.display = visible ? 'inline-block' : 'none';
            if (spinnerEnsayosRc5) spinnerEnsayosRc5.style.display = 'none';
        }
    }

    function renderOpcionesEnsayoPorEstado(fecha, res) {
        visualRegistroPorFecha[fecha] = (res && res.ensayosConVisual && typeof res.ensayosConVisual === 'object') ? res.ensayosConVisual : (visualRegistroPorFecha[fecha] || {});
        packingYaEnviadoPorFecha[fecha] = (res && res.ensayosConPacking && typeof res.ensayosConPacking === 'object') ? res.ensayosConPacking : (packingYaEnviadoPorFecha[fecha] || {});
        recepcionC5YaEnviadoPorFecha[fecha] = (res && res.ensayosConC5 && typeof res.ensayosConC5 === 'object') ? res.ensayosConC5 : (recepcionC5YaEnviadoPorFecha[fecha] || {});
        thermoKingYaEnviadoPorFecha[fecha] = (res && res.ensayosConThermoKing && typeof res.ensayosConThermoKing === 'object') ? res.ensayosConThermoKing : (thermoKingYaEnviadoPorFecha[fecha] || {});
        if (res && res.ok && res.ensayos && res.ensayos.length > 0) {
            if (!visualRegistroPorFecha[fecha]) visualRegistroPorFecha[fecha] = {};
            res.ensayos.forEach(function (nv) {
                visualRegistroPorFecha[fecha][String(nv)] = true;
            });
        }
        aplicarEstadoBorradorLocalRc5(fecha);
        cacheEnsayosParaSelect = { fecha: fecha, res: res };
        if (rc5ResumenPanel && currentSidebarView !== 'recepcion-c5') {
            rc5ResumenPanel.style.display = 'none';
            rc5ResumenPanel.innerHTML = '';
        }
        selEnsayoPacking.innerHTML = '<option value="" disabled selected>Seleccione ensayo...</option>';
        if (res.ok && res.ensayos && res.ensayos.length > 0) {
            if (msgNoEnsayos) msgNoEnsayos.style.display = 'none';
            if (msgNoEnsayosRc5) msgNoEnsayosRc5.style.display = 'none';
            res.ensayos.forEach(function (n) {
                var opt = document.createElement('option');
                opt.value = n;
                var tienePacking = flagEnsayoEnMap_(packingYaEnviadoPorFecha[fecha], n);
                var tieneC5 = flagEnsayoEnMap_(recepcionC5YaEnviadoPorFecha[fecha], n);
                var tieneTK = flagEnsayoEnMap_(thermoKingYaEnviadoPorFecha[fecha], n);
                var enVistaC5 = currentSidebarView === 'recepcion-c5';
                if (enVistaC5) {
                    var tieneVis = flagEnsayoEnMap_(visualRegistroPorFecha[fecha], n);
                    var b = function (on) { return on ? '✓' : '✗'; };
                    opt.textContent = 'Ensayo ' + n + ' · Vis ' + b(tieneVis) + ' · Pk ' + b(tienePacking) + ' · TK ' + b(tieneTK) + ' · C5 ' + b(tieneC5);
                    var bloqRc5Srv = ensayoServidorTieneRecepcionC5Completo(fecha, n);
                    opt.disabled = bloqRc5Srv;
                    opt.title = bloqRc5Srv
                        ? 'Visual, Packing, Thermo King y Recepción C5 ya están registrados en hoja para este ensayo.'
                        : 'Visual: datos de registro en hoja. Packing / Thermo King / C5 según columnas de la hoja. «Cargar datos» trae la fila de esta fecha y ensayo.';
                } else {
                    /* #formato-packing: Pk/TK según hoja; opción deshabilitada si formato completo en servidor (fundo A9 → Pk+TK; otro fundo → solo Pk). */
                    var bFmt = function (on) { return on ? '✓' : '✗'; };
                    opt.textContent = 'Ensayo ' + n + ' · Pk ' + bFmt(tienePacking) + ' · TK ' + bFmt(tieneTK);
                    var bloqFmtSrv = ensayoServidorTieneFormatoPackingCompleto(fecha, n);
                    opt.disabled = bloqFmtSrv;
                    opt.title = bloqFmtSrv ? tituloBloqueoFmtServidor_(res, n) : 'Pk y TK según columnas guardadas en la hoja.';
                }
                selEnsayoPacking.appendChild(opt);
            });
            if (currentSidebarView === 'recepcion-c5') {
                actualizarPanelResumenRc5(fecha, res);
            }
        } else {
            if (msgNoEnsayos) msgNoEnsayos.style.display = 'flex';
            if (msgNoEnsayosRc5) msgNoEnsayosRc5.style.display = 'flex';
            if (rc5ResumenPanel) {
                rc5ResumenPanel.style.display = 'none';
                rc5ResumenPanel.innerHTML = '';
            }
        }
        actualizarBannerRecepcionC5();
        actualizarBannerFormatoPacking();
        syncFechaEnsayoEspejoDesdePrimario();
        scheduleActualizarBloqueoSelectEnsayoFormatoPacking();
        scheduleActualizarBloqueoWrapperPackingPanelHoja();
        syncPackingMetaInputsEstado();
        try { syncThermoKingWrapperVisibility(); } catch (eSyncFmt) {}
    }
    if (inputFechaPacking && selEnsayoPacking) {
        selEnsayoPacking.addEventListener('change', async function (ev) {
            const fecha = (inputFechaPacking.value || '').trim();
            const newEnsayo = (selEnsayoPacking.value || '').trim();
            if (newEnsayo && ev && ev.isTrusted && typeof Swal !== 'undefined') {
                Swal.fire({
                    toast: true,
                    position: 'top-end',
                    icon: 'info',
                    title: 'Elige el formato que quieres llenar.',
                    showConfirmButton: false,
                    timer: 3200,
                    timerProgressBar: true
                });
            }
            if (currentFechaPacking && currentEnsayoPacking) guardarPackingEnStore(currentFechaPacking, currentEnsayoPacking);
            currentFechaPacking = fecha;
            currentEnsayoPacking = newEnsayo;
            packingDatosCampoCargados = false;
            if (fecha && newEnsayo) {
                /* Como Campo (cambio de rótulo): solo cambiar contexto y borrador del ensayo. No vaciar vista de hoja aquí; eso solo aplica al cambiar fecha o al usar «Cargar datos». */
                restaurarPackingDesdeStore(fecha, newEnsayo);
            }
            if (newEnsayo && datosEnsayos) {
                var lenV = datosEnsayos.visual && datosEnsayos.visual[newEnsayo] && datosEnsayos.visual[newEnsayo].visual ? datosEnsayos.visual[newEnsayo].visual.length : 0;
                var lenA = datosEnsayos.acopio && datosEnsayos.acopio[newEnsayo] && datosEnsayos.acopio[newEnsayo].visual ? datosEnsayos.acopio[newEnsayo].visual.length : 0;
                if (lenV > 0 || lenA > 0) maxFilasPacking = Math.max(lenV, lenA);
            }
            if (typeof actualizarBannerRecepcionC5 === 'function') actualizarBannerRecepcionC5();
            if (typeof actualizarBannerFormatoPacking === 'function') actualizarBannerFormatoPacking();
            syncFechaEnsayoEspejoDesdePrimario();
            scheduleActualizarBloqueoSelectEnsayoFormatoPacking();
            scheduleActualizarBloqueoWrapperPackingPanelHoja();
            syncPackingMetaInputsEstado();
            try { syncThermoKingWrapperVisibility(); } catch (eTkSync) {}
        });
        inputFechaPacking.addEventListener('change', async function () {
            if (currentFechaPacking && currentEnsayoPacking) guardarPackingEnStore(currentFechaPacking, currentEnsayoPacking);
            var fecha = (inputFechaPacking.value || '').trim();
            currentFechaPacking = fecha;
            currentEnsayoPacking = '';
            selEnsayoPacking.innerHTML = '<option value="" disabled selected>Seleccione ensayo...</option>';
            selEnsayoPacking.value = '';
            if (msgNoEnsayos) msgNoEnsayos.style.display = 'none';
            if (msgNoEnsayosRc5) msgNoEnsayosRc5.style.display = 'none';
            if (!fecha) {
                selEnsayoPacking.querySelector('option').textContent = 'Seleccione fecha primero...';
                limpiarTodoPacking();
                syncFechaEnsayoEspejoDesdePrimario();
                if (typeof actualizarBannerFormatoPacking === 'function') actualizarBannerFormatoPacking();
                scheduleActualizarBloqueoWrapperPackingPanelHoja();
                syncPackingMetaInputsEstado();
                return;
            }
            limpiarDatosPackingAlCambiarFecha(fecha);
            setSpinnersCargandoEnsayos(true);
            selEnsayoPacking.disabled = true;
            var rowFe = rowFechaEnsayoActivo();
            if (rowFe) rowFe.classList.add('is-loading');
            try {
                var res = await getEnsayosPorFecha(fecha);
                renderOpcionesEnsayoPorEstado(fecha, res);
            } catch (_) {
                selEnsayoPacking.innerHTML = '<option value="" disabled selected>Sin conexión. Elige fecha y prueba de nuevo.</option>';
            } finally {
                selEnsayoPacking.disabled = false;
                setSpinnersCargandoEnsayos(false);
                if (rowFe) rowFe.classList.remove('is-loading');
                /* render/sync ocurrió con el primario disabled; el espejo RC5 copió disabled=true. Re-sincronizar ya habilitado. */
                syncFechaEnsayoEspejoDesdePrimario();
                validarFechaInspeccionVsFechaPacking();
                try { asegurarFechasMetaPackingVisibles(); } catch (eFmeta) {}
                if (typeof actualizarBannerFormatoPacking === 'function') actualizarBannerFormatoPacking();
                scheduleActualizarBloqueoSelectEnsayoFormatoPacking();
                scheduleActualizarBloqueoWrapperPackingPanelHoja();
                syncPackingMetaInputsEstado();
            }
        });
        var viewFechaRc5El = document.getElementById('view_fecha_rc5');
        var selEnsayoRc5El = document.getElementById('view_ensayo_numero_rc5');
        if (viewFechaRc5El) {
            viewFechaRc5El.addEventListener('change', function () {
                aplicarPrimarioDesdeCamposRc5SiCorresponde();
                inputFechaPacking.dispatchEvent(new Event('change', { bubbles: true }));
            });
        }
        if (selEnsayoRc5El) {
            selEnsayoRc5El.addEventListener('change', function () {
                aplicarPrimarioDesdeCamposRc5SiCorresponde();
                selEnsayoPacking.dispatchEvent(new Event('change', { bubbles: true }));
            });
        }
    }

    var inputFechaInspeccion = document.getElementById('view_fecha_inspeccion');
    var inputResponsablePacking = document.getElementById('view_responsable');
    function syncPackingMetaInputsEstado() {
        var selModo = document.getElementById('packing_modo_envio');
        var enFormatoPacking = currentSidebarView === 'formato-packing';
        var modoActivo = enFormatoPacking ? getPackingModoEnvio() : '';
        var bloquear = !enFormatoPacking || !selModo || selModo.disabled || !modoActivo;
        if (inputFechaInspeccion) inputFechaInspeccion.disabled = bloquear;
        if (inputResponsablePacking) inputResponsablePacking.disabled = bloquear;
    }
    function bindPersistPackingMetaTopInputs() {
        var persist = function () {
            if (!currentFechaPacking || !currentEnsayoPacking) return;
            guardarPackingEnStore(currentFechaPacking, currentEnsayoPacking);
        };
        if (inputFechaInspeccion) {
            inputFechaInspeccion.addEventListener('input', persist);
            inputFechaInspeccion.addEventListener('change', persist);
        }
        if (inputResponsablePacking) {
            inputResponsablePacking.addEventListener('input', persist);
            inputResponsablePacking.addEventListener('change', persist);
        }
    }
    if (inputFechaInspeccion) {
        inputFechaInspeccion.addEventListener('change', function () {
            validarFechaInspeccionVsFechaPacking();
        });
    }
    bindPersistPackingMetaTopInputs();
    syncPackingMetaInputsEstado();

    const btnCargarDatos = document.getElementById('btn_cargar_datos');
    const btnCargarDatosRc5 = document.getElementById('btn_cargar_datos_rc5');
    var spinnerCargar = document.getElementById('spinner_cargar');
    var spinnerCargarRc5 = document.getElementById('spinner_cargar_rc5');
    async function ejecutarClickCargarDatosPacking() {
        aplicarPrimarioDesdeCamposRc5SiCorresponde();
        const fechaEl = document.getElementById('view_fecha');
        const ensayoEl = document.getElementById('view_ensayo_numero');
        const fecha = fechaEl && fechaEl.value ? fechaEl.value.trim() : '';
        const ensayoNumero = ensayoEl && ensayoEl.value ? ensayoEl.value.trim() : '';
        if (!fecha || !ensayoNumero) {
            Swal.fire({ title: 'Faltan datos', text: 'Elige fecha y ensayo para cargar.', icon: 'warning' });
            return;
        }
        if (currentFechaPacking && currentEnsayoPacking) guardarPackingEnStore(currentFechaPacking, currentEnsayoPacking);
        var spin = currentSidebarView === 'recepcion-c5' ? spinnerCargarRc5 : spinnerCargar;
        var btnActivo = currentSidebarView === 'recepcion-c5' ? btnCargarDatosRc5 : btnCargarDatos;
        var btnTxt = btnActivo ? btnActivo.querySelector('.btn-cargar-text') : null;
        if (spin) spin.style.display = 'inline-block';
        if (btnTxt) btnTxt.textContent = 'Cargando...';
        if (btnCargarDatos) btnCargarDatos.disabled = true;
        if (btnCargarDatosRc5) btnCargarDatosRc5.disabled = true;
        packingDatosCampoCargados = false;
        try { syncThermoKingWrapperVisibility(); } catch (eSync) {}
        var rowFe = rowFechaEnsayoActivo();
        if (rowFe) rowFe.classList.add('is-loading');
        if (sectionDatos) sectionDatos.classList.add('is-loading');
        try {
            const res = await getDatosPacking(fecha, ensayoNumero, true);
            if (!res.ok || !res.data) {
                Swal.fire({ title: 'Sin datos', text: res.error || 'No hay registro para esa fecha y ensayo.', icon: 'info' });
                return;
            }
            const d = res.data;
            currentFechaPacking = fecha;
            currentEnsayoPacking = ensayoNumero;
            aplicarDatosVistaPacking(d, res.fromCache);
            restaurarPackingDesdeStore(fecha, ensayoNumero);
            Swal.fire({
                title: res.fromCache ? 'Datos cargados (caché)' : 'Datos cargados',
                text: 'Toda la data que se trae proviene del registro de campo.',
                icon: 'success',
                timer: 2800,
                showConfirmButton: false
            });
        } catch (err) {
            Swal.fire({ title: 'Error', text: err.message || 'No se pudo cargar.', icon: 'error' });
        } finally {
            if (spin) spin.style.display = 'none';
            if (btnTxt) btnTxt.textContent = 'Cargar datos';
            if (btnCargarDatos) btnCargarDatos.disabled = false;
            if (btnCargarDatosRc5) btnCargarDatosRc5.disabled = false;
            if (rowFe) rowFe.classList.remove('is-loading');
            if (sectionDatos) sectionDatos.classList.remove('is-loading');
            try { syncThermoKingWrapperVisibility(); } catch (eSync2) {}
        }
    }
    if (btnCargarDatos) btnCargarDatos.addEventListener('click', ejecutarClickCargarDatosPacking);
    if (btnCargarDatosRc5) btnCargarDatosRc5.addEventListener('click', ejecutarClickCargarDatosPacking);

    (function () {
        var vEtapa = document.getElementById('view_etapa');
        var vCampo = document.getElementById('view_campo');
        if (vEtapa) vEtapa.addEventListener('change', function () { var v = this.getAttribute('data-last-value'); if (v !== null && v !== '') this.value = v; });
        if (vCampo) vCampo.addEventListener('change', function () { var v = this.getAttribute('data-last-value'); if (v !== null && v !== '') this.value = v; });
    })();

    (function syncVistaInicial() {
        const esPacking = isVistaPackingSidebar();
        const wrapperFormatoCampoInit = document.getElementById('wrapper_formato_campo');
        if (esPacking) {
            if (wrapperFormatoCampoInit) wrapperFormatoCampoInit.style.display = 'none';
            if (selectMedicion) selectMedicion.removeAttribute('required');
            if (viewVisualContainer) viewVisualContainer.style.display = 'none';
            if (viewPackingContainer) viewPackingContainer.style.display = 'block';
            if (btnGuardarRegistro) btnGuardarRegistro.style.display = 'none';
            if (btnGuardarPacking) btnGuardarPacking.style.display = 'block';
            syncThermoKingWrapperVisibility();
        } else {
            if (wrapperFormatoCampoInit) wrapperFormatoCampoInit.style.display = '';
            if (selectMedicion) selectMedicion.setAttribute('required', 'required');
            if (viewVisualContainer) viewVisualContainer.style.display = 'block';
            if (viewPackingContainer) viewPackingContainer.style.display = 'none';
            if (btnGuardarRegistro) btnGuardarRegistro.style.display = 'block';
            if (btnGuardarPacking) btnGuardarPacking.style.display = 'none';
        }
        if (isVistaPackingSidebar()) {
            tipoActual = 'packing';
        } else if (selectMedicion && selectMedicion.value) {
            tipoActual = selectMedicion.value;
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
        packing8: []
    };

    /** Thermo King (A9): temperaturas por fila; no entra en consistencia de filas packing1–8. */
    var datosThermokingTemp = [];
    function emptyThermokingTempRow() {
        return { ic_cm: '', ic_pu: '', st_cm: '', st_pu: '', it_amb: '', it_veh: '', it_pu: '', d_amb: '', d_veh: '', d_pu: '' };
    }

    /** Thermo King — observaciones por muestra (tabla dinámica); no cuenta en consistencia packing1–8. */
    var datosThermokingObs = [];

    function emptyThermokingTiemposRow() {
        return { ic: '', st: '', it: '', dp: '' };
    }
    var datosThermokingTiempos = [];
    function emptyThermokingPesoTkRow() {
        return { ic: '', st: '', it: '', dp: '' };
    }
    var datosThermokingPesoTk = [];
    function emptyThermokingHumedadTkRow() {
        return { ic: '', st: '', aei: '', ivi: '', aed: '', ivd: '' };
    }
    var datosThermokingHumedadTk = [];
    function emptyThermokingPresionTkRow() {
        return { ic: '', st: '', aei: '', ivi: '', aed: '', ivd: '' };
    }
    var datosThermokingPresionTk = [];
    function emptyThermokingVaporRow() {
        return { ic: '', scm: '', it: '', st: '' };
    }
    var datosThermokingVapor = [];

    /** Recepción C5: mismas formas que packing1–8; réplica limitada por filas en packing2_c5 (peso bruto). */
    function emptyC5Packing1Row() { return { recepcion: '', ingreso_gasificado: '', salida_gasificado: '', ingreso_prefrio: '', salida_prefrio: '' }; }
    function emptyC5Packing2Row() { return { peso_recepcion: '', peso_ingreso_gasificado: '', peso_salida_gasificado: '', peso_ingreso_prefrio: '', peso_salida_prefrio: '' }; }
    function emptyC5Packing3Row() { return { t_amb_recep: '', t_pulp_recep: '', t_amb_ing: '', t_pulp_ing: '', t_amb_sal: '', t_pulp_sal: '', t_amb_pre_in: '', t_pulp_pre_in: '', t_amb_pre_out: '', t_pulp_pre_out: '' }; }
    function emptyC5Packing4Row() { return { recepcion: '', ingreso_gasificado: '', salida_gasificado: '', ingreso_prefrio: '', salida_prefrio: '' }; }
    function emptyC5Packing5Row() { return { recepcion: '', ingreso_gasificado: '', salida_gasificado: '', ingreso_prefrio: '', salida_prefrio: '' }; }
    function emptyC5Packing6Row() { return { recepcion: '', ingreso_gasificado: '', salida_gasificado: '', ingreso_prefrio: '', salida_prefrio: '' }; }
    function emptyC5Packing8Row() { return { observacion: '' }; }
    var datosC5 = {
        packing1_c5: [],
        packing2_c5: [],
        packing3_c5: [],
        packing4_c5: [],
        packing5_c5: [],
        packing6_c5: [],
        packing8_c5: []
    };
    var REG_C5_PESO_IDS = ['reg_packing_peso_recepcion_c5', 'reg_packing_peso_ingreso_gasificado_c5', 'reg_packing_peso_salida_gasificado_c5', 'reg_packing_peso_ingreso_prefrio_c5', 'reg_packing_peso_salida_prefrio_c5'];
    var REG_C5_TEMP_IDS = ['reg_packing_temp_amb_recepcion_c5', 'reg_packing_temp_pulp_recepcion_c5', 'reg_packing_temp_amb_ingreso_gas_c5', 'reg_packing_temp_pulp_ingreso_gas_c5', 'reg_packing_temp_amb_salida_gas_c5', 'reg_packing_temp_pulp_salida_gas_c5', 'reg_packing_temp_amb_ingreso_pre_c5', 'reg_packing_temp_pulp_ingreso_pre_c5', 'reg_packing_temp_amb_salida_pre_c5', 'reg_packing_temp_pulp_salida_pre_c5'];
    var REG_C5_TIMES_IDS = ['reg_packing_recepcion_c5', 'reg_packing_ingreso_gasificado_c5', 'reg_packing_salida_gasificado_c5', 'reg_packing_ingreso_prefrio_c5', 'reg_packing_salida_prefrio_c5'];
    var REG_C5_HUMEDAD_IDS = ['reg_packing_humedad_recepcion_c5', 'reg_packing_humedad_ingreso_gasificado_c5', 'reg_packing_humedad_salida_gasificado_c5', 'reg_packing_humedad_ingreso_prefrio_c5', 'reg_packing_humedad_salida_prefrio_c5'];
    var REG_C5_PRESION_VAPOR_IDS = ['reg_packing_presion_recepcion_c5', 'reg_packing_presion_ingreso_gasificado_c5', 'reg_packing_presion_salida_gasificado_c5', 'reg_packing_presion_ingreso_prefrio_c5', 'reg_packing_presion_salida_prefrio_c5'];
    var REG_C5_PRESION_FRUTA_IDS = ['reg_packing_presion_fruta_recepcion_c5', 'reg_packing_presion_fruta_ingreso_gasificado_c5', 'reg_packing_presion_fruta_salida_gasificado_c5', 'reg_packing_presion_fruta_ingreso_prefrio_c5', 'reg_packing_presion_fruta_salida_prefrio_c5'];
    /** Fila plantilla C5: únicos campos editables; el resto de inputs de plantilla van disabled siempre (el detalle se completa al agregar fila + Editar). */
    var REG_C5_PRIMERA_PLANTILLA_IDS = [
        'reg_packing_recepcion_c5',
        'reg_packing_peso_recepcion_c5',
        'reg_packing_temp_amb_recepcion_c5', 'reg_packing_temp_pulp_recepcion_c5',
        'reg_packing_humedad_recepcion_c5',
        'reg_packing_presion_recepcion_c5',
        'reg_packing_presion_fruta_recepcion_c5',
        'reg_packing_obs_texto_c5'
    ];
    function getRegC5TemplateTodosInputIds() {
        return REG_C5_TIMES_IDS.concat(
            REG_C5_PESO_IDS,
            REG_C5_TEMP_IDS,
            REG_C5_HUMEDAD_IDS,
            REG_C5_PRESION_VAPOR_IDS,
            REG_C5_PRESION_FRUTA_IDS,
            ['reg_packing_obs_texto_c5']
        );
    }
    function recepcionC5HayFilasPesoEnDatos() {
        return !!(datosC5.packing2_c5 && datosC5.packing2_c5.length > 0);
    }
    /** Modales «Editar» C5: mismos límites que la fila plantilla (solo Recep. / 1.ª entrada por bloque). */
    function c5SetSwalInputBloqueado(el, bloquear) {
        if (!el) return;
        el.disabled = !!bloquear;
        el.classList.toggle('c5-template-input--bloqueado', !!bloquear);
        if (bloquear) {
            el.setAttribute('title', 'Solo puede editar la columna Recep. / 1.ª entrada; este campo no está habilitado.');
        } else {
            el.removeAttribute('title');
        }
    }
    /** #recepcion-c5: plantilla (#wrapper_c5_1) — solo REG_C5_PRIMERA_PLANTILLA_IDS sin disabled; todo lo demás disabled (no escribir). Los botones + siguen usando «hay peso» para SweetAlert. */
    function applyRecepcionC5TemplatePrimerInputLock() {
        if (typeof currentSidebarView === 'undefined' || currentSidebarView !== 'recepcion-c5') return;
        var hayPeso = recepcionC5HayFilasPesoEnDatos();
        var permitir = {};
        REG_C5_PRIMERA_PLANTILLA_IDS.forEach(function (id) { permitir[id] = true; });
        getRegC5TemplateTodosInputIds().forEach(function (id) {
            var el = document.getElementById(id);
            if (!el) return;
            var bloquear = !permitir[id];
            el.disabled = bloquear;
            el.classList.toggle('c5-template-input--bloqueado', bloquear);
            if (bloquear) {
                el.setAttribute('title', 'En la fila plantilla solo puede usar la columna Recep. / 1.ª entrada. Agregue la fila con + y complete el resto con Editar en la tabla.');
            } else {
                el.removeAttribute('title');
            }
        });
        var bloquearAddResto = !hayPeso;
        /* No usar disabled en los +: el click no se dispara y SweetAlert (canAgregarFilaC5) nunca aparece. */
        ['btn-add-packing_c5', 'btn-add-temp_c5', 'btn-add-packing-humedad_c5', 'btn-add-packing-presion_c5', 'btn-add-packing-presion-fruta_c5', 'btn-add-packing-obs_c5'].forEach(function (bid) {
            var b = document.getElementById(bid);
            if (b) {
                b.disabled = false;
                b.setAttribute('aria-disabled', bloquearAddResto ? 'true' : 'false');
                b.classList.toggle('c5-btn-add--locked', bloquearAddResto);
            }
        });
        var bPeso = document.getElementById('btn-add-pesos_c5');
        if (bPeso) {
            bPeso.disabled = false;
            bPeso.removeAttribute('aria-disabled');
            bPeso.classList.remove('c5-btn-add--locked');
        }
    }

    function tkDispTime(v) {
        if (v == null || String(v).trim() === '') return '-';
        return String(v).trim();
    }

    /** Legacy: filas guardadas con N/A; POST debe enviar vacío literal. */
    function limpiarLegacyThermokingCamMpValor(v) {
        if (v == null) return '';
        var s = String(v).trim();
        if (s === 'N/A' || s === 'N/Ag' || /^n\/a$/i.test(s)) return '';
        return s;
    }

    function tkTdTiempoCamMp(v) {
        if (thermokingUsarCamaraMP === false) {
            return '<td class="thermoking-tk-cam-mp-cell--disabled"></td>';
        }
        var vv = limpiarLegacyThermokingCamMpValor(v);
        return '<td>' + tkDispTime(vv) + '</td>';
    }

    function replicarThermokingVsPacking2(arr, rowIndex, emptyRow, renderFn, nombreCorto) {
        const ref = (datosThermokingPesoTk && datosThermokingPesoTk.length) || 0;
        if (ref === 0) {
            Swal.fire({
                title: 'Atención',
                text: 'No hay filas en Peso de bruto muestra (Thermo King). Agrega al menos una fila en Peso para poder replicar.',
                icon: 'warning',
                confirmButtonColor: '#2f7cc0'
            });
            return;
        }
        if (arr.length >= ref) {
            Swal.fire({
                title: 'Límite alcanzado',
                text: 'Ya tienes ' + ref + ' fila(s) en ' + nombreCorto + ', igual que en Peso de bruto muestra (Thermo King).',
                icon: 'info',
                confirmButtonColor: '#2f7cc0'
            });
            return;
        }
        var fuente = (rowIndex >= 0 && arr[rowIndex] != null) ? arr[rowIndex] : (arr.length > 0 ? arr[arr.length - 1] : emptyRow());
        arr.push(JSON.parse(JSON.stringify(fuente)));
        renderFn();
        actualizarTodosContadoresPacking();
        persistPackingSiThermoking();
    }

    /** Packing por (fecha, ensayo): al cambiar de ensayo se guarda y se restaura, como en Calibrado Visual. Límite para mantener la app ligera. */
    const datosPackingPorEnsayo = {};
    var datosPackingPorEnsayoKeysOrder = [];
    var MAX_PACKING_STORE_KEYS = 20;
    var PACKING_BORRADOR_LOCAL_KEY = 'tiempos_packing_borrador_v1';

    function persistPackingBorradorLocal() {
        try {
            localStorage.setItem(PACKING_BORRADOR_LOCAL_KEY, JSON.stringify({
                data: datosPackingPorEnsayo,
                order: datosPackingPorEnsayoKeysOrder
            }));
        } catch (e) {
            console.warn('[Packing] no se pudo guardar borrador en localStorage:', e);
        }
    }

    function loadPackingBorradorLocal() {
        try {
            var raw = localStorage.getItem(PACKING_BORRADOR_LOCAL_KEY);
            if (!raw) return;
            var o = JSON.parse(raw);
            if (!o || typeof o.data !== 'object' || o.data === null) return;
            var data = o.data;
            for (var k in data) {
                if (Object.prototype.hasOwnProperty.call(data, k)) datosPackingPorEnsayo[k] = data[k];
            }
            if (Array.isArray(o.order)) datosPackingPorEnsayoKeysOrder = o.order.slice();
        } catch (e) {
            console.warn('[Packing] borrador localStorage:', e);
        }
    }
    /* No rehidratar borrador al cargar la página: evita que al elegir ensayo aparezcan datos de pruebas viejas
     * (localStorage no se borra con "vaciar caché" del navegador). El borrador en disco sigue guardándose por si
     * en el futuro se añade "recuperar borrador"; mientras tanto, el flujo es como Campo: datos al elegir ensayo
     * solo desde memoria de esta sesión o desde «Cargar datos» (GET). */
    // loadPackingBorradorLocal();

    /** Como Campo: el trabajo vive en memoria (datosPacking + datosPackingPorEnsayo); localStorage solo como respaldo, no en cada tecla. */
    var persistPackingBorradorTimer = null;
    var PERSIST_PACKING_DEBOUNCE_MS = 2500;
    function schedulePersistPackingBorradorDebounced() {
        if (persistPackingBorradorTimer) clearTimeout(persistPackingBorradorTimer);
        persistPackingBorradorTimer = setTimeout(function () {
            persistPackingBorradorTimer = null;
            persistPackingBorradorLocal();
        }, PERSIST_PACKING_DEBOUNCE_MS);
    }
    function flushPersistPackingBorradorNow() {
        if (persistPackingBorradorTimer) {
            clearTimeout(persistPackingBorradorTimer);
            persistPackingBorradorTimer = null;
        }
        persistPackingBorradorLocal();
    }
    window.addEventListener('beforeunload', function () {
        flushPersistPackingBorradorNow();
    });
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') {
            flushPersistPackingBorradorNow();
            return;
        }
        if (document.visibilityState === 'visible' && (currentSidebarView === 'formato-packing' || currentSidebarView === 'recepcion-c5') && currentFechaPacking && currentEnsayoPacking) {
            packingReaplicarBorradorSiHaySesion();
        }
    });
    /** Despacho acopio por fila: con internet viene del GET; sin internet se usa la caché del último GET (getDatosPacking). Así se valida igual con y sin conexión. */
    var despachoPorFilaDesdeGET = {};

    function keyPacking(fecha, ensayo) {
        return (fecha || '') + '_' + (ensayo || '');
    }

    /** Meta Recepción C5: responsable (antes se guardaba como placa_c5). */
    function valorResponsableC5DesdeStored(stored) {
        if (!stored) return '';
        var r = stored.responsable_c5;
        if (r != null && String(r).trim() !== '') return String(r).trim();
        var p = stored.placa_c5;
        if (p != null && String(p).trim() !== '') return String(p).trim();
        return '';
    }

    function guardarPackingEnStore(fecha, ensayo) {
        if (!fecha || !ensayo) return;
        var fi = document.getElementById('view_fecha_inspeccion');
        var resp = document.getElementById('view_responsable');
        var h = document.getElementById('view_hora_recepcion');
        var n = document.getElementById('view_n_viaje');
        var hSalTk = document.getElementById('hora_salida_thermoking');
        var placaTk = document.getElementById('placa_thermoking');
        var hIniC5 = document.getElementById('hora_inicio_recepcion_c5');
        var respC5 = document.getElementById('responsable_c5');
        const key = keyPacking(fecha, ensayo);
        var prev = datosPackingPorEnsayo[key];
        var fiVal = fi ? (fi.value || '').trim() : (prev && prev.fecha_inspeccion != null ? String(prev.fecha_inspeccion).trim() : '');
        var respVal = resp ? (resp.value || '').trim() : (prev && prev.responsable != null ? String(prev.responsable).trim() : '');
        datosPackingPorEnsayo[key] = {
            maxFilasPacking: maxFilasPacking,
            fecha_inspeccion: fiVal,
            responsable: respVal,
            fecha_inspeccion_thermoking: fiVal,
            responsable_thermoking: respVal,
            hora_recepcion: h ? (h.value || '').trim() : '',
            n_viaje: n ? (n.value || '').trim() : '',
            hora_salida_thermoking: hSalTk ? (hSalTk.value || '').trim() : '',
            placa_thermoking: placaTk ? (placaTk.value || '').trim() : '',
            hora_inicio_recepcion_c5: hIniC5 ? (hIniC5.value || '').trim() : '',
            responsable_c5: respC5 ? (respC5.value || '').trim() : '',
            packing1: datosPacking.packing1.map(function (x) { return { ...x }; }),
            packing2: datosPacking.packing2.map(function (x) { return { ...x }; }),
            packing3: datosPacking.packing3.map(function (x) { return { ...x }; }),
            packing4: datosPacking.packing4.map(function (x) { return { ...x }; }),
            packing5: datosPacking.packing5.map(function (x) { return { ...x }; }),
            packing6: datosPacking.packing6.map(function (x) { return { ...x }; }),
            packing8: datosPacking.packing8.map(function (x) { return { ...x }; }),
            thermoking_temp: datosThermokingTemp.map(function (x) { return { ...x }; }),
            thermoking_obs: datosThermokingObs.map(function (x) { return { ...x }; }),
            thermoking_tiempos: datosThermokingTiempos.map(function (x) { return { ...x }; }),
            thermoking_peso: datosThermokingPesoTk.map(function (x) { return { ...x }; }),
            thermoking_humedad_tk: datosThermokingHumedadTk.map(function (x) { return { ...x }; }),
            thermoking_presion_tk: datosThermokingPresionTk.map(function (x) { return { ...x }; }),
            thermoking_vapor: datosThermokingVapor.map(function (x) { return { ...x }; }),
            thermoking_usar_camara_mp: thermokingUsarCamaraMP,
            packing1_c5: datosC5.packing1_c5.map(function (x) { return { ...x }; }),
            packing2_c5: datosC5.packing2_c5.map(function (x) { return { ...x }; }),
            packing3_c5: datosC5.packing3_c5.map(function (x) { return { ...x }; }),
            packing4_c5: datosC5.packing4_c5.map(function (x) { return { ...x }; }),
            packing5_c5: datosC5.packing5_c5.map(function (x) { return { ...x }; }),
            packing6_c5: datosC5.packing6_c5.map(function (x) { return { ...x }; }),
            packing8_c5: datosC5.packing8_c5.map(function (x) { return { ...x }; })
        };
        if (datosPackingPorEnsayoKeysOrder.indexOf(key) === -1) datosPackingPorEnsayoKeysOrder.push(key);
        while (datosPackingPorEnsayoKeysOrder.length > MAX_PACKING_STORE_KEYS) {
            var oldKey = datosPackingPorEnsayoKeysOrder.shift();
            delete datosPackingPorEnsayo[oldKey];
        }
        schedulePersistPackingBorradorDebounced();
        scheduleRefrescarUiEstadoRc5();
        scheduleActualizarBloqueoSelectEnsayoFormatoPacking();
    }

    /** Ruta #formato-packing: '' | pk | tk | pk-tk (vacío hasta elegir y con datos cargados). */
    function getPackingModoEnvio() {
        var sel = document.getElementById('packing_modo_envio');
        var v = sel ? String(sel.value || '').trim() : '';
        if (v === 'pk' || v === 'tk' || v === 'pk-tk') return v;
        return '';
    }

    /** Habilita #packing_modo_envio solo con datos de hoja; si no hay datos, vacía y deshabilita. */
    function syncPackingModoSelectState() {
        var sel = document.getElementById('packing_modo_envio');
        if (!sel) return;
        var fmt = typeof currentSidebarView !== 'undefined' && currentSidebarView === 'formato-packing';
        if (fmt) {
            sel.disabled = !packingDatosCampoCargados;
            sel.title = packingDatosCampoCargados
                ? 'Elige el formato de envío'
                : 'Carga los datos de la hoja primero (botón Cargar datos)';
            if (!packingDatosCampoCargados) sel.value = '';
        } else {
            sel.disabled = true;
        }
        syncPackingMetaInputsEstado();
    }

    /**
     * Opciones del select de formato según Pk/TK ya guardados en hoja (GET ensayos).
     * Evita elegir un modo que pisaría datos existentes. Si solo queda una opción, se elige sola.
     */
    function actualizarOpcionesPackingModoEnvioSelect() {
        var sel = document.getElementById('packing_modo_envio');
        if (!sel) return;
        if (typeof currentSidebarView === 'undefined' || currentSidebarView !== 'formato-packing') return;

        var fecha = inputFechaPacking && inputFechaPacking.value ? String(inputFechaPacking.value).trim() : '';
        var n = selEnsayoPacking && selEnsayoPacking.value ? String(selEnsayoPacking.value).trim() : '';
        var pkEnHoja = false;
        var tkEnHoja = false;
        if (fecha && n) {
            pkEnHoja = !!flagEnsayoEnMap_(packingYaEnviadoPorFecha[fecha], n);
            tkEnHoja = !!flagEnsayoEnMap_(thermoKingYaEnviadoPorFecha[fecha], n);
        }

        var fundoEl = document.getElementById('view_fundo');
        var fundoNorm = fundoEl ? String(fundoEl.value || '').trim().toUpperCase() : '';
        var fundoPermiteThermoKing = fundoNorm === 'A9';
        var tipSoloA9 = 'Thermo King solo aplica cuando el fundo del registro es A9.';

        var optPk = sel.querySelector('option[value="pk"]');
        var optTk = sel.querySelector('option[value="tk"]');
        var optPkTk = sel.querySelector('option[value="pk-tk"]');
        if (!optPk || !optTk || !optPkTk) return;

        var tipDup = 'Ya hay datos en la hoja para este módulo; no se puede volver a enviar pisándolos.';

        optPk.disabled = pkEnHoja;
        optPk.title = pkEnHoja ? tipDup : 'Solo Packing';
        optTk.disabled = tkEnHoja || !fundoPermiteThermoKing;
        optTk.title = tkEnHoja ? tipDup : (!fundoPermiteThermoKing ? tipSoloA9 : 'Solo Thermo King');
        /* Combinado solo si aún faltan ambos en hoja y el fundo permite TK (A9) */
        optPkTk.disabled = pkEnHoja || tkEnHoja || !fundoPermiteThermoKing;
        optPkTk.title = (pkEnHoja || tkEnHoja) ? tipDup : (!fundoPermiteThermoKing ? tipSoloA9 : 'Packing y Thermo King en el mismo envío');

        var cur = String(sel.value || '').trim();
        if (cur) {
            var curOpt = sel.querySelector('option[value="' + cur + '"]');
            if (!curOpt || curOpt.disabled) sel.value = '';
        }

        var habilitadas = [];
        ['pk', 'tk', 'pk-tk'].forEach(function (m) {
            var o = sel.querySelector('option[value="' + m + '"]');
            if (o && !o.disabled) habilitadas.push(m);
        });
        if (packingDatosCampoCargados && habilitadas.length === 1 && !sel.value) {
            sel.value = habilitadas[0];
        }

        if (packingDatosCampoCargados) {
            if (pkEnHoja && tkEnHoja) {
                sel.title = 'Packing y Thermo King ya están en la hoja para este ensayo.';
            } else if (habilitadas.length === 0) {
                sel.title = 'No hay formato disponible con el estado actual de la hoja.';
            } else if (!fundoPermiteThermoKing) {
                sel.title = 'Thermo King solo aplica con fundo A9; si el fundo es otro, solo puede elegirse Packing cuando falte en la hoja.';
            } else {
                sel.title = 'Solo se habilita lo que aún falta registrar en la hoja (según Pk / TK).';
            }
        }
        syncPackingMetaInputsEstado();
    }

    function getWorkscopeGuardarFlags() {
        var rc5 = typeof currentSidebarView !== 'undefined' && currentSidebarView === 'recepcion-c5';
        if (rc5) {
            var wc5 = document.getElementById('wrapper_c5_1');
            var visC5 = !!(wc5 && wc5.style.display !== 'none' && wc5.getAttribute('aria-hidden') !== 'true');
            /* Ruta C5: no usa #packing_modo_envio ni workscope; el envío es solo Recepción C5 (merge en hoja). */
            return { guardar_packing: false, guardar_thermoking: false, guardar_c5: visC5 };
        }
        var fmt = typeof currentSidebarView !== 'undefined' && currentSidebarView === 'formato-packing';
        if (fmt) {
            var modo = getPackingModoEnvio();
            var fundoEl = document.getElementById('view_fundo');
            var v = fundoEl ? String(fundoEl.value || '').trim().toUpperCase() : '';
            var chkTk = document.getElementById('chk_thermoking_habilitar');
            var datosOk = !!packingDatosCampoCargados;
            var esFundoA9 = v === 'A9';
            if (!modo || !datosOk) {
                return { guardar_packing: false, guardar_thermoking: false, guardar_c5: false };
            }
            var pk = false;
            var tk = false;
            if (modo === 'pk') {
                pk = true;
            } else if (modo === 'tk') {
                tk = esFundoA9;
            } else if (modo === 'pk-tk') {
                pk = true;
                tk = !!(esFundoA9 && chkTk && chkTk.checked && !chkTk.disabled);
            }
            return { guardar_packing: pk, guardar_thermoking: tk, guardar_c5: false };
        }
        var bp = document.getElementById('workscope-btn-packing');
        var bt = document.getElementById('workscope-btn-thermoking');
        var pk = !!(bp && bp.classList.contains('is-active'));
        var tk = !!(bt && bt.classList.contains('is-active'));
        return { guardar_packing: pk, guardar_thermoking: tk, guardar_c5: false };
    }

    /** Toasts al elegir formato en #packing_modo_envio (top-end). */
    (function bindPackingModoEnvioSelect() {
        var sel = document.getElementById('packing_modo_envio');
        if (!sel || sel.dataset.boundModoEnvio) return;
        sel.dataset.boundModoEnvio = '1';
        function fireModoToast(msg, icon) {
            if (typeof Swal === 'undefined') return;
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: icon || 'info',
                title: msg,
                showConfirmButton: false,
                timer: 2800,
                timerProgressBar: true
            });
        }
        sel.addEventListener('change', function () {
            try { syncThermoKingWrapperVisibility(); } catch (e) {}
            syncPackingMetaInputsEstado();
            var m = getPackingModoEnvio();
            if (m === 'pk') fireModoToast('Se activó el formato Packing.', 'success');
            else if (m === 'tk') fireModoToast('Se activó el formato Thermo King.', 'success');
            else if (m === 'pk-tk') fireModoToast('Se activó el formato Packing junto con Thermo King.', 'success');
            else if (packingDatosCampoCargados) fireModoToast('Indica el formato de envío para mostrar los paneles.', 'info');
        });
    })();

    function compararFechasIso(isoA, isoB) {
        if (!isoA || !isoB) return null;
        var a = String(isoA).trim();
        var b = String(isoB).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return null;
        if (a < b) return -1;
        if (a > b) return 1;
        return 0;
    }

    /** Fecha inspección ≥ Fecha del registro (view_fecha). Si no, SweetAlert y se corrige a la fecha del registro. */
    function validarFechaInspeccionVsFechaPacking() {
        var elFecha = document.getElementById('view_fecha');
        var elIns = document.getElementById('view_fecha_inspeccion');
        if (!elIns || !elFecha) return true;
        var fecha = (elFecha.value || '').trim();
        var ins = (elIns.value || '').trim();
        if (!fecha || !ins) return true;
        if (compararFechasIso(ins, fecha) >= 0) return true;
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: 'Fecha inválida',
                text: 'La fecha de inspección debe ser igual o posterior a la fecha del registro (' + formatearFechaParaVer(fecha) + '). Se ajustó a la fecha del registro.',
                icon: 'warning',
                confirmButtonColor: '#2f7cc0'
            });
        }
        setNativeDateValue(elIns, fecha);
        if (currentFechaPacking && currentEnsayoPacking) guardarPackingEnStore(currentFechaPacking, currentEnsayoPacking);
        return false;
    }

    function restaurarPackingDesdeStore(fecha, ensayo) {
        const key = keyPacking(fecha, ensayo);
        const stored = datosPackingPorEnsayo[key];
        var setView = function (id, val) {
            var el = document.getElementById(id);
            if (!el) return;
            var v = (val != null && val !== '') ? String(val).trim() : '';
            if (id === 'view_fecha_inspeccion') {
                if (v) setNativeDateValue(el, v);
                else { el.value = ''; try { el.removeAttribute('value'); } catch (e) {} }
            } else if (id === 'view_hora_recepcion') {
                if (v) setNativeTimeValue(el, v);
                else { el.value = ''; try { el.removeAttribute('value'); } catch (e) {} }
            } else if (id === 'hora_salida_thermoking' || id === 'hora_inicio_recepcion_c5') {
                if (v) setNativeTimeValue(el, v);
                else { el.value = ''; try { el.removeAttribute('value'); } catch (e) {} }
            } else el.value = v;
        };
        if (!stored) {
            maxFilasPacking = 8;
            setView('view_fecha_inspeccion', '');
            setView('view_responsable', '');
            setView('view_hora_recepcion', '');
            setView('view_n_viaje', '');
            setView('hora_salida_thermoking', '');
            setView('placa_thermoking', '');
            setView('hora_inicio_recepcion_c5', '');
            setView('responsable_c5', '');
            ['packing1', 'packing2', 'packing3', 'packing4', 'packing5', 'packing6', 'packing8'].forEach(function (k) { datosPacking[k] = []; });
            datosThermokingTemp = [];
            datosThermokingObs = [];
            datosThermokingTiempos = [];
            datosThermokingPesoTk = [];
            datosThermokingHumedadTk = [];
            datosThermokingPresionTk = [];
            datosThermokingVapor = [];
            thermokingUsarCamaraMP = null;
            applyThermokingCamaraMpModeUI();
            ['packing1_c5', 'packing2_c5', 'packing3_c5', 'packing4_c5', 'packing5_c5', 'packing6_c5', 'packing8_c5'].forEach(function (k) { datosC5[k] = []; });
            renderAllPackingRows();
            scheduleActualizarBloqueoSelectEnsayoFormatoPacking();
            return;
        }
        setView('view_fecha_inspeccion', stored.fecha_inspeccion);
        setView('view_responsable', stored.responsable);
        setView('view_hora_recepcion', stored.hora_recepcion);
        setView('view_n_viaje', stored.n_viaje);
        setView('hora_salida_thermoking', stored.hora_salida_thermoking != null ? stored.hora_salida_thermoking : '');
        setView('placa_thermoking', stored.placa_thermoking != null ? stored.placa_thermoking : '');
        setView('hora_inicio_recepcion_c5', stored.hora_inicio_recepcion_c5 != null ? stored.hora_inicio_recepcion_c5 : '');
        setView('responsable_c5', valorResponsableC5DesdeStored(stored));
        if (stored.maxFilasPacking != null && stored.maxFilasPacking > 0) maxFilasPacking = stored.maxFilasPacking;
        ['packing1', 'packing2', 'packing3', 'packing4', 'packing5', 'packing6', 'packing8'].forEach(function (k) {
            datosPacking[k] = (stored[k] || []).map(function (x) { return { ...x }; });
        });
        datosThermokingTemp = (stored.thermoking_temp || []).map(function (x) {
            var e = emptyThermokingTempRow();
            if (x && typeof x === 'object') {
                ['ic_cm', 'ic_pu', 'st_cm', 'st_pu', 'it_amb', 'it_veh', 'it_pu', 'd_amb', 'd_veh', 'd_pu'].forEach(function (key) {
                    if (x[key] != null) e[key] = limpiarLegacyThermokingCamMpValor(String(x[key]));
                });
            }
            return e;
        });
        datosThermokingObs = (stored.thermoking_obs || []).map(function (x) {
            return { observacion: (x && x.observacion != null) ? String(x.observacion) : '' };
        });
        datosThermokingTiempos = (stored.thermoking_tiempos || []).map(function (x) {
            var e = emptyThermokingTiemposRow();
            if (x && typeof x === 'object') {
                ['ic', 'st', 'it', 'dp'].forEach(function (key) {
                    if (x[key] != null) e[key] = limpiarLegacyThermokingCamMpValor(String(x[key]));
                });
            }
            return e;
        });
        datosThermokingPesoTk = (stored.thermoking_peso || []).map(function (x) {
            var e = emptyThermokingPesoTkRow();
            if (x && typeof x === 'object') {
                ['ic', 'st', 'it', 'dp'].forEach(function (key) {
                    if (x[key] != null) e[key] = limpiarLegacyThermokingCamMpValor(String(x[key]));
                });
            }
            return e;
        });
        datosThermokingHumedadTk = (stored.thermoking_humedad_tk || []).map(function (x) {
            var e = emptyThermokingHumedadTkRow();
            if (x && typeof x === 'object') {
                ['ic', 'st', 'aei', 'ivi', 'aed', 'ivd'].forEach(function (key) {
                    if (x[key] != null) e[key] = limpiarLegacyThermokingCamMpValor(String(x[key]));
                });
            }
            return e;
        });
        datosThermokingPresionTk = (stored.thermoking_presion_tk || []).map(function (x) {
            var e = emptyThermokingPresionTkRow();
            if (x && typeof x === 'object') {
                ['ic', 'st', 'aei', 'ivi', 'aed', 'ivd'].forEach(function (key) {
                    if (x[key] != null) e[key] = limpiarLegacyThermokingCamMpValor(String(x[key]));
                });
            }
            return e;
        });
        datosThermokingVapor = (stored.thermoking_vapor || []).map(function (x) {
            var e = emptyThermokingVaporRow();
            if (x && typeof x === 'object') {
                ['ic', 'scm', 'it', 'st'].forEach(function (key) {
                    if (x[key] != null) e[key] = limpiarLegacyThermokingCamMpValor(String(x[key]));
                });
            }
            return e;
        });
        if (stored.thermoking_usar_camara_mp === true || stored.thermoking_usar_camara_mp === false) thermokingUsarCamaraMP = stored.thermoking_usar_camara_mp;
        else thermokingUsarCamaraMP = null;
        applyThermokingCamaraMpModeUI();
        datosC5.packing1_c5 = (stored.packing1_c5 || []).map(function (x) {
            var e = emptyC5Packing1Row();
            if (x && typeof x === 'object') {
                ['recepcion', 'ingreso_gasificado', 'salida_gasificado', 'ingreso_prefrio', 'salida_prefrio'].forEach(function (key) {
                    if (x[key] != null) e[key] = String(x[key]);
                });
            }
            return e;
        });
        datosC5.packing2_c5 = (stored.packing2_c5 || []).map(function (x) {
            var e = emptyC5Packing2Row();
            if (x && typeof x === 'object') {
                ['peso_recepcion', 'peso_ingreso_gasificado', 'peso_salida_gasificado', 'peso_ingreso_prefrio', 'peso_salida_prefrio'].forEach(function (key) {
                    if (x[key] != null) e[key] = x[key];
                });
            }
            return e;
        });
        datosC5.packing3_c5 = (stored.packing3_c5 || []).map(function (x) {
            var e = emptyC5Packing3Row();
            if (x && typeof x === 'object') {
                ['t_amb_recep', 't_pulp_recep', 't_amb_ing', 't_pulp_ing', 't_amb_sal', 't_pulp_sal', 't_amb_pre_in', 't_pulp_pre_in', 't_amb_pre_out', 't_pulp_pre_out'].forEach(function (key) {
                    if (x[key] != null) e[key] = x[key];
                });
            }
            return e;
        });
        ['packing4_c5', 'packing5_c5', 'packing6_c5'].forEach(function (pk) {
            var keys = ['recepcion', 'ingreso_gasificado', 'salida_gasificado', 'ingreso_prefrio', 'salida_prefrio'];
            datosC5[pk] = (stored[pk] || []).map(function (x) {
                var e = pk === 'packing4_c5' ? emptyC5Packing4Row() : (pk === 'packing5_c5' ? emptyC5Packing5Row() : emptyC5Packing6Row());
                if (x && typeof x === 'object') {
                    keys.forEach(function (key) {
                        if (x[key] != null) e[key] = x[key];
                    });
                }
                return e;
            });
        });
        datosC5.packing8_c5 = (stored.packing8_c5 || []).map(function (x) {
            return { observacion: (x && x.observacion != null) ? String(x.observacion) : '' };
        });
        renderAllPackingRows();
        validarFechaInspeccionVsFechaPacking();
        scheduleActualizarBloqueoSelectEnsayoFormatoPacking();
    }

    function persistPackingSiThermoking() {
        if (currentFechaPacking && currentEnsayoPacking) guardarPackingEnStore(currentFechaPacking, currentEnsayoPacking);
        scheduleRefrescarUiEstadoRc5();
    }

    (function bindThermoKingMetaInputs() {
        var hSal = document.getElementById('hora_salida_thermoking');
        var placa = document.getElementById('placa_thermoking');
        function persist() {
            if (currentFechaPacking && currentEnsayoPacking) guardarPackingEnStore(currentFechaPacking, currentEnsayoPacking);
            scheduleRefrescarUiEstadoRc5();
        }
        if (hSal) {
            hSal.addEventListener('change', persist);
            hSal.addEventListener('input', persist);
        }
        if (placa) {
            placa.addEventListener('input', persist);
            placa.addEventListener('change', persist);
        }
    })();

    (function bindC5MetaInputs() {
        var hIni = document.getElementById('hora_inicio_recepcion_c5');
        var resp = document.getElementById('responsable_c5');
        function persist() {
            if (currentFechaPacking && currentEnsayoPacking) guardarPackingEnStore(currentFechaPacking, currentEnsayoPacking);
            scheduleRefrescarUiEstadoRc5();
        }
        if (hIni) {
            hIni.addEventListener('change', persist);
            hIni.addEventListener('input', persist);
        }
        if (resp) {
            resp.addEventListener('input', persist);
            resp.addEventListener('change', persist);
        }
    })();

    var rafThermokingProgress = null;
    function isCountableProgressField(el) {
        if (!el || el.disabled) return false;
        var tag = el.tagName;
        if (tag === 'TEXTAREA') return true;
        if (tag === 'SELECT') return true;
        if (tag === 'INPUT') {
            var t = (el.type || '').toLowerCase();
            if (t === 'button' || t === 'submit' || t === 'hidden' || t === 'file' || t === 'checkbox' || t === 'radio') return false;
            return true;
        }
        return false;
    }
    /** Progreso general del panel: usa campos meta + filas REGISTRADAS (tbody dinámicos), no la fila de captura. */
    function thermokingProgressPorFilas(root) {
        var camposTotal = 0;
        var camposLlenos = 0;
        var filasCompletas = 0;
        var nFilas = 0;
        var c5Root = root && root.closest && root.closest('#wrapper_c5_1');
        var c5BodyId = root && root.id ? String(root.id) : '';
        function c5IndicesSoloRecepEnCelda() {
            if (c5BodyId === 'body-packing-3_c5') return [0, 1];
            return [0];
        }
        function esVacio(v) {
            var s = String(v == null ? '' : v).trim();
            if (s === '' || s === '-' || s === '--:--') return true;
            // Para celdas renderizadas (sin input), ignorar guiones, espacios, iconos/símbolos.
            var compact = s.toLowerCase().replace(/[^0-9a-z]+/g, '');
            return compact === '';
        }
        var meta = root.querySelector('.thermoking-meta-row');
        if (meta) {
            var metaFields = [];
            meta.querySelectorAll('input, textarea, select').forEach(function (el) {
                if (!isCountableProgressField(el)) return;
                metaFields.push(el);
            });
            if (metaFields.length) {
                nFilas++;
                var metaOk = true;
                metaFields.forEach(function (el) {
                    camposTotal++;
                    var v = el.value != null ? String(el.value).trim() : '';
                    if (!esVacio(v)) camposLlenos++;
                    else metaOk = false;
                });
                if (metaOk) filasCompletas++;
            }
        }
        root.querySelectorAll('tbody[id]').forEach(function (tb) {
            var tbId = tb.getAttribute('id') || '';
            // La fila de captura (ids que contienen "-capture") no cuenta como fila registrada.
            // Ejemplos: tbody-visual-capture, tbody-packing-capture-1, tbody-packing-capture-temp.
            if (/-capture(?:$|-)/i.test(tbId)) return;
            tb.querySelectorAll('tr').forEach(function (tr) {
                var tds = Array.from(tr.querySelectorAll('td'));
                if (tds.length < 3) return;
                var dataCells = tds.slice(1, tds.length - 1);
                if (!dataCells.length) return;
                nFilas++;
                var rowOk = true;
                if (c5Root && c5BodyId && /^body-packing-[0-9]+_c5$/.test(c5BodyId)) {
                    c5IndicesSoloRecepEnCelda().forEach(function (idx) {
                        if (idx >= dataCells.length) return;
                        var td = dataCells[idx];
                        if (td.classList && td.classList.contains('thermoking-tk-cam-mp-cell--disabled')) {
                            camposTotal++;
                            camposLlenos++;
                            return;
                        }
                        camposTotal++;
                        var control = td.querySelector('input, textarea, select');
                        var raw = control ? (control.value || '') : (td.textContent || '');
                        if (!esVacio(raw)) camposLlenos++;
                        else rowOk = false;
                    });
                } else {
                    dataCells.forEach(function (td) {
                        if (td.classList && td.classList.contains('thermoking-tk-cam-mp-cell--disabled')) {
                            camposTotal++;
                            camposLlenos++;
                            return;
                        }
                        camposTotal++;
                        var control = td.querySelector('input, textarea, select');
                        var raw = control ? (control.value || '') : (td.textContent || '');
                        if (!esVacio(raw)) camposLlenos++;
                        else rowOk = false;
                    });
                }
                if (rowOk) filasCompletas++;
            });
        });
        if (camposTotal === 0) return { pct: 0, filasCompletas: 0, nFilas: 0, camposLlenos: 0, camposTotal: 0 };
        var pct = Math.min(100, Math.round((camposLlenos / camposTotal) * 100));
        return { pct: pct, filasCompletas: filasCompletas, nFilas: nFilas, camposLlenos: camposLlenos, camposTotal: camposTotal };
    }
    /** Progreso del panel principal (A9/C5): wrappers internos + inputs de cabecera (si existen). */
    function thermokingProgressPanelPorWrappers(panelBody) {
        function filasRegistradasEnBody(bodyEl) {
            if (!bodyEl) return 0;
            var n = 0;
            bodyEl.querySelectorAll('tbody[id]').forEach(function (tb) {
                var tbId = tb.getAttribute('id') || '';
                if (/-capture(?:$|-)/i.test(tbId)) return;
                n += tb.querySelectorAll('tr').length;
            });
            return n;
        }
        // Regla estricta Thermo King: 7 wrappers completos y mismo número de filas que PESO.
        if (panelBody && panelBody.id === 'body-thermoking-panel') {
            var idsTk = [
                'body-thermoking-tiempos',
                'body-thermoking-peso',
                'body-thermoking-temperatura',
                'body-thermoking-humedad',
                'body-thermoking-presion-amb',
                'body-thermoking-vapor-fruta',
                'body-thermoking-obs'
            ];
            var refBody = document.getElementById('body-thermoking-peso');
            var refFilas = filasRegistradasEnBody(refBody);
            var completosTk = 0;
            idsTk.forEach(function (id) {
                var body = document.getElementById(id);
                if (!body) return;
                var r = thermokingProgressPorFilas(body);
                var filas = filasRegistradasEnBody(body);
                /* Observaciones TK: mismas filas que peso; texto opcional (no exige celdas llenas). */
                var ok = (id === 'body-thermoking-obs')
                    ? (refFilas > 0 && filas === refFilas)
                    : (refFilas > 0 && filas === refFilas && r.pct === 100);
                if (ok) completosTk++;
            });
            var totalTk = idsTk.length;
            var okPanelTk = refFilas > 0 && completosTk === totalTk;
            return { pct: okPanelTk ? 100 : 0, wrappersCompletos: completosTk, totalWrappers: totalTk, metaPct: null };
        }
        var wrappers = [];
        panelBody.querySelectorAll('.collapsible-wrapper .collapsible-card').forEach(function (card) {
            var h = card.querySelector('.card-header');
            if (!h) return;
            var bodyId = h.getAttribute('data-target');
            if (!bodyId) return;
            var body = document.getElementById(bodyId);
            if (!body) return;
            wrappers.push(body);
        });
        var metaPct = null;
        var meta = panelBody.querySelector('.thermoking-meta-row');
        if (meta) {
            var metaTotal = 0;
            var metaLlenos = 0;
            meta.querySelectorAll('input, textarea, select').forEach(function (el) {
                if (!isCountableProgressField(el)) return;
                metaTotal++;
                var v = el.value != null ? String(el.value).trim() : '';
                if (v !== '') metaLlenos++;
            });
            metaPct = metaTotal > 0 ? Math.min(100, Math.round((metaLlenos / metaTotal) * 100)) : null;
        } else if (panelBody.id === 'body-c5-panel') {
            var hIniMeta = document.getElementById('hora_inicio_recepcion_c5');
            var respMeta = document.getElementById('responsable_c5');
            var mt = 0;
            var ml = 0;
            [hIniMeta, respMeta].forEach(function (el) {
                if (!el || !isCountableProgressField(el)) return;
                mt++;
                var vv = el.value != null ? String(el.value).trim() : '';
                if (vv !== '') ml++;
            });
            metaPct = mt > 0 ? Math.min(100, Math.round((ml / mt) * 100)) : null;
        }
        if (!wrappers.length && metaPct == null) return { pct: 0, wrappersCompletos: 0, totalWrappers: 0, metaPct: null };
        var suma = 0;
        var completos = 0;
        wrappers.forEach(function (w) {
            var wid = w.id || '';
            /* Observaciones packing/C5: no arrastran el % del panel; se consideran completas sin exigir texto. */
            if (wid === 'body-packing-8' || wid === 'body-packing-8_c5') {
                suma += 100;
                completos++;
                return;
            }
            var r = thermokingProgressPorFilas(w);
            var pctW = r.pct;
            // Sin filas registradas en el wrapper = incompleto en el total del panel.
            if (r.nFilas === 0) pctW = 0;
            suma += pctW;
            if (pctW === 100) completos++;
        });
        var totalBloques = wrappers.length;
        if (metaPct != null) {
            suma += metaPct;
            totalBloques++;
        }
        return { pct: Math.min(100, Math.round(suma / Math.max(1, totalBloques))), wrappersCompletos: completos, totalWrappers: wrappers.length, metaPct: metaPct };
    }
    function refreshThermokingProgressBars() {
        var campoBodiesConReglaFilas = {
            'body-tiempos': true,
            'body-temperaturas': true,
            'body-humedad': true,
            'body-presion': true,
            'body-presion-fruta': true
        };
        var packingBodiesConReglaFilas = {
            'body-packing-1': true,
            'body-packing-3': true,
            'body-packing-4': true,
            'body-packing-5': true,
            'body-packing-6': true
        };
        var c5BodiesConReglaFilas = {
            'body-packing-1_c5': true,
            'body-packing-3_c5': true,
            'body-packing-4_c5': true,
            'body-packing-5_c5': true,
            'body-packing-6_c5': true
        };
        var thermokingBodiesConReglaFilas = {
            'body-thermoking-tiempos': true,
            'body-thermoking-temperatura': true,
            'body-thermoking-humedad': true,
            'body-thermoking-presion-amb': true,
            'body-thermoking-vapor-fruta': true
        };
        function filasRegistradasVisual() {
            var tb = document.getElementById('tbody-visual');
            return tb ? tb.querySelectorAll('tr').length : 0;
        }
        function filasRegistradasPacking2() {
            var tb = document.getElementById('tbody-packing-pesos');
            return tb ? tb.querySelectorAll('tr').length : 0;
        }
        function filasRegistradasPacking2C5() {
            var tb = document.getElementById('tbody-packing-pesos_c5');
            return tb ? tb.querySelectorAll('tr').length : 0;
        }
        function filasRegistradasThermokingPeso() {
            var tb = document.getElementById('tbody-thermoking-peso');
            return tb ? tb.querySelectorAll('tr').length : 0;
        }
        /** Pastilla COMPLETADO / INCOMPLETO: mismo icono LIVE animado; ancho fijo vía CSS. */
        function thermokingLiveIndicatorHtml(done) {
            var cls = 'thermoking-live-indicator' + (done ? ' thermoking-live-indicator--done' : '');
            return '<span class="' + cls + '" aria-hidden="true">' +
                '<span class="thermoking-live-shake">' +
                '<span class="thermoking-live-wave thermoking-live-wave--1"></span>' +
                '<span class="thermoking-live-wave thermoking-live-wave--2"></span>' +
                '<span class="thermoking-live-dot"></span>' +
                '</span></span>';
        }
        function thermokingProgressStatusInnerHtml(markComplete) {
            return thermokingLiveIndicatorHtml(!!markComplete) +
                '<span class="thermoking-status-txt">' + (markComplete ? 'Completado' : 'Incompleto') + '</span>';
        }
        document.querySelectorAll('[data-progress-root]').forEach(function (wrap) {
            var rootId = wrap.getAttribute('data-progress-root');
            if (!rootId) return;
            var root = document.getElementById(rootId);
            var label = wrap.querySelector('.thermoking-progress-label');
            if (!root || !label) return;
            var markComplete = false;
            if (wrap.classList.contains('thermoking-progress-wrap--card')) {
                var r = thermokingProgressPorFilas(root);
                var pct = r.pct;
                var obsOpcionalSiempreCompleto = {
                    'body-observacion': true,
                    'body-packing-8': true,
                    'body-packing-8_c5': true,
                    'body-thermoking-obs': true
                };
                var completo;
                if (obsOpcionalSiempreCompleto[rootId]) {
                    completo = true;
                    wrap.setAttribute('title', 'Observaciones opcionales — no son obligatorias para guardar');
                } else {
                    completo = r.nFilas > 0 && pct === 100;
                    if (campoBodiesConReglaFilas[rootId]) {
                        var ref = filasRegistradasVisual();
                        if (ref > 0 && r.nFilas !== ref) completo = false;
                    }
                    if (packingBodiesConReglaFilas[rootId]) {
                        var refPacking = filasRegistradasPacking2();
                        if (refPacking > 0 && r.nFilas !== refPacking) completo = false;
                    }
                    if (c5BodiesConReglaFilas[rootId]) {
                        var refPackingC5 = filasRegistradasPacking2C5();
                        if (refPackingC5 > 0 && r.nFilas !== refPackingC5) completo = false;
                    }
                    if (thermokingBodiesConReglaFilas[rootId]) {
                        var refTk = filasRegistradasThermokingPeso();
                        if (refTk > 0 && r.nFilas !== refTk) completo = false;
                        else if (refTk === 0) completo = false;
                    }
                    if (!completo && campoBodiesConReglaFilas[rootId]) {
                        var ref2 = filasRegistradasVisual();
                        if (ref2 > 0 && r.nFilas !== ref2) wrap.setAttribute('title', 'Filas registradas: ' + r.nFilas + ' (deben ser ' + ref2 + ', igual que Visual)');
                        else wrap.setAttribute('title', 'Falta completar una o más filas');
                    } else if (!completo && packingBodiesConReglaFilas[rootId]) {
                        var refPacking2 = filasRegistradasPacking2();
                        if (refPacking2 > 0 && r.nFilas !== refPacking2) wrap.setAttribute('title', 'Filas registradas: ' + r.nFilas + ' (deben ser ' + refPacking2 + ', igual que Peso bruto muestra)');
                        else wrap.setAttribute('title', 'Falta completar una o más filas');
                    } else if (!completo && c5BodiesConReglaFilas[rootId]) {
                        var refPacking2C5 = filasRegistradasPacking2C5();
                        if (refPacking2C5 > 0 && r.nFilas !== refPacking2C5) wrap.setAttribute('title', 'Filas registradas: ' + r.nFilas + ' (deben ser ' + refPacking2C5 + ', igual que Peso bruto muestra C5)');
                        else wrap.setAttribute('title', 'Falta completar una o más filas');
                    } else if (!completo && thermokingBodiesConReglaFilas[rootId]) {
                        var refTk2 = filasRegistradasThermokingPeso();
                        if (refTk2 > 0 && r.nFilas !== refTk2) wrap.setAttribute('title', 'Filas registradas: ' + r.nFilas + ' (deben ser ' + refTk2 + ', igual que Peso Thermo King)');
                        else if (refTk2 === 0) wrap.setAttribute('title', 'Primero registra filas en Peso Thermo King');
                        else wrap.setAttribute('title', 'Falta completar una o más filas');
                    } else {
                        wrap.setAttribute('title', completo ? 'Todas las filas registradas están completas' : 'Falta completar una o más filas');
                    }
                }
                markComplete = completo;
            } else {
                var p = thermokingProgressPanelPorWrappers(root);
                var pct = p.pct;
                markComplete = pct === 100;
                wrap.setAttribute('title', markComplete ? 'Todas las subsecciones de este panel están completas' : 'Faltan datos: revise la cabecera o alguna subsección del panel');
            }
            var nextState = markComplete ? 'complete' : 'incomplete';
            var prevState = String(label.getAttribute('data-state') || '');
            label.className = 'thermoking-progress-label thermoking-progress-label--with-status thermoking-status-pill ' + (markComplete ? 'is-complete' : 'is-incomplete');
            label.setAttribute('role', 'status');
            label.setAttribute('aria-live', 'polite');
            label.setAttribute('title', markComplete ? 'Sección completada' : 'En vivo: la sección se actualiza al registrar datos — aún incompleto');
            /** Evita re-crear el DOM en cada input/change: si no cambia el estado, la animación no se reinicia. */
            if (prevState !== nextState || !label.querySelector('.thermoking-live-dot')) {
                label.innerHTML = thermokingProgressStatusInnerHtml(markComplete);
            }
            label.setAttribute('data-state', nextState);
            wrap.classList.toggle('thermoking-progress-wrap--complete', markComplete);
        });
        try { actualizarTextoBotonEnviarRecepcionC5(); } catch (_) {}
    }

    /** #recepcion-c5: texto del botón principal según si el panel C5 está «Completado». */
    function actualizarTextoBotonEnviarRecepcionC5() {
        var btn = document.getElementById('btn-guardar-packing');
        var txt = btn && btn.querySelector('.btn-guardar-text');
        if (!txt || (btn && btn.getAttribute('aria-busy') === 'true')) return;
        if (typeof currentSidebarView === 'undefined' || currentSidebarView !== 'recepcion-c5') {
            if (/RECEPCIÓN C5|LISTO/i.test(String(txt.textContent || ''))) txt.textContent = 'ENVIAR PACKING';
            return;
        }
        var lbl = document.querySelector('#wrapper_c5_1 .thermoking-progress-wrap--panel[data-progress-root="body-c5-panel"] .thermoking-progress-label');
        var ok = lbl && lbl.classList.contains('is-complete');
        txt.textContent = ok ? 'ENVIAR RECEPCIÓN C5 — LISTO' : 'ENVIAR RECEPCIÓN C5';
    }

    /** Etiquetas para mensajes cuando una pastilla no está en «Completado». */
    var PROGRESO_ROOT_LABELS = {
        'body-jarras': 'Tiempo de llenado de jarras',
        'body-visual': 'Pesos (Visual)',
        'body-tiempos': 'Tiempos',
        'body-temperaturas': 'Temperatura muestra',
        'body-humedad': 'Humedad',
        'body-presion': 'Presión ambiente',
        'body-presion-fruta': 'Presión fruta',
        'body-observacion': 'Observación',
        'body-packing-panel': 'Packing — panel (cabecera y subsecciones)',
        'body-packing-1': 'Packing — Tiempos muestra',
        'body-packing-2': 'Packing — Peso bruto muestra',
        'body-packing-3': 'Packing — Temperatura muestra',
        'body-packing-4': 'Packing — Humedad',
        'body-packing-5': 'Packing — Presión vapor ambiente',
        'body-packing-6': 'Packing — Presión vapor fruta',
        'body-packing-8': 'Packing — Observaciones',
        'body-thermoking-panel': 'Thermo King — panel',
        'body-thermoking-tiempos': 'Thermo King — Tiempos',
        'body-thermoking-peso': 'Thermo King — Peso bruto',
        'body-thermoking-temperatura': 'Thermo King — Temperatura',
        'body-thermoking-humedad': 'Thermo King — Humedad',
        'body-thermoking-presion-amb': 'Thermo King — Presión ambiente',
        'body-thermoking-vapor-fruta': 'Thermo King — Vapor fruta',
        'body-thermoking-obs': 'Thermo King — Observaciones',
        'body-c5-panel': 'Recepción C5 — panel',
        'body-packing-1_c5': 'C5 — Tiempos',
        'body-packing-2_c5': 'C5 — Peso bruto',
        'body-packing-3_c5': 'C5 — Temperatura',
        'body-packing-4_c5': 'C5 — Humedad',
        'body-packing-5_c5': 'C5 — Presión ambiente',
        'body-packing-6_c5': 'C5 — Presión fruta',
        'body-packing-8_c5': 'C5 — Observaciones'
    };

    /**
     * Misma regla que las pastillas COMPLETADO: tras refrescar, cada .thermoking-progress-wrap del alcance debe tener .is-complete.
     */
    function validarProgresoUiEnContenedores(scopeList) {
        refreshThermokingProgressBars();
        var all = [];
        for (var i = 0; i < scopeList.length; i++) {
            var item = scopeList[i];
            var el = item.el;
            if (!el) continue;
            el.querySelectorAll('.thermoking-progress-wrap').forEach(function (w) {
                var label = w.querySelector('.thermoking-progress-label');
                if (!label || !label.classList.contains('is-complete')) {
                    var rid = w.getAttribute('data-progress-root') || '';
                    all.push({ nombre: item.nombre, rid: rid });
                }
            });
        }
        if (all.length === 0) return { ok: true };
        var lines = all.map(function (x) {
            var lab = PROGRESO_ROOT_LABELS[x.rid] || x.rid || 'Sección';
            return '<strong>' + (x.nombre || '') + '</strong>: ' + lab;
        });
        return {
            ok: false,
            msg: 'Todas las secciones deben mostrar «Completado» (100% y filas alineadas con la referencia) antes de guardar.<br><br>' + lines.join('<br>')
        };
    }

    function scheduleThermokingProgressRefresh() {
        if (rafThermokingProgress != null) return;
        rafThermokingProgress = requestAnimationFrame(function () {
            rafThermokingProgress = null;
            refreshThermokingProgressBars();
            scheduleActualizarBloqueoSelectEnsayoFormatoPacking();
        });
    }
    (function bindThermokingProgressDelegation() {
        ['view_visual_container', 'view_packing_container', 'wrapper_thermoking_1', 'wrapper_c5_1'].forEach(function (id) {
            var w = document.getElementById(id);
            if (!w) return;
            w.addEventListener('input', scheduleThermokingProgressRefresh, true);
            w.addEventListener('change', scheduleThermokingProgressRefresh, true);
            // Altas/bajas de filas actualizan barras de progreso.
            try {
                var mo = new MutationObserver(function () { scheduleThermokingProgressRefresh(); });
                mo.observe(w, { childList: true, subtree: true });
            } catch (_) {}
        });
        scheduleThermokingProgressRefresh();
    })();

    /** Thermo King: ruta #formato-packing; opcional vía #chk_thermoking_habilitar solo en modo PK+TK. Recepción C5: #recepcion-c5 y Fundo A9. */
    function syncThermoKingWrapperVisibility() {
        syncPackingModoSelectState();
        actualizarOpcionesPackingModoEnvioSelect();
        var fundoEl = document.getElementById('view_fundo');
        var v = fundoEl ? String(fundoEl.value || '').trim().toUpperCase() : '';
        var showA9 = v === 'A9';
        var vpc = document.getElementById('view_packing_container');
        if (vpc) vpc.classList.toggle('packing-container--fundo-a9', showA9);
        var tieneFundo = v !== '';
        var fmt = currentSidebarView === 'formato-packing';
        var rc5 = currentSidebarView === 'recepcion-c5';
        var modo = getPackingModoEnvio();
        var pkTkMode = modo === 'pk-tk';
        var modoTkSolo = modo === 'tk';
        var datosOk = packingDatosCampoCargados;

        var chkTk = document.getElementById('chk_thermoking_habilitar');
        var optInWrap = document.getElementById('packing_fundo_tk_optin');
        /* Solo TK: casilla siempre marcada y bloqueada. PK+TK: casilla libre (casos especiales sin TK). Solo con fundo A9. */
        var mostrarOptinTk = fmt && tieneFundo && datosOk && showA9 && (pkTkMode || modoTkSolo);
        if (optInWrap && chkTk) {
            if (mostrarOptinTk) {
                optInWrap.removeAttribute('hidden');
                if (modoTkSolo) {
                    chkTk.checked = true;
                    chkTk.disabled = true;
                    chkTk.title = 'Thermo King está incluido (modo solo TK en el selector).';
                } else {
                    chkTk.disabled = false;
                    chkTk.title = 'Casos especiales: incluir Thermo King al guardar (desmarcar si solo packing)';
                    /* Con datos desde hoja: al pasar a Fundo A9 se marca por defecto (caso línea frío); otros fundos el usuario elige. */
                    if (packingDatosCampoCargados && prevFundoParaTkOptin !== v && v === 'A9') {
                        chkTk.checked = true;
                    }
                }
            } else {
                try {
                    var aeOpt = document.activeElement;
                    if (aeOpt && optInWrap.contains(aeOpt) && typeof aeOpt.blur === 'function') aeOpt.blur();
                } catch (_) {}
                optInWrap.setAttribute('hidden', '');
                chkTk.disabled = true;
                if (!pkTkMode && !modoTkSolo) chkTk.checked = false;
            }
            if (!tieneFundo) chkTk.checked = false;
        }
        prevFundoParaTkOptin = v;

        var modoActivo = modo !== '' && datosOk;
        var showTk = false;
        if (fmt && tieneFundo && datosOk && modoActivo && showA9) {
            if (modo === 'tk') {
                showTk = true;
            } else if (modo === 'pk-tk' && chkTk && chkTk.checked && !chkTk.disabled) {
                showTk = true;
            }
        }
        var showPacking = fmt && modoActivo && (modo === 'pk' || modo === 'pk-tk');

        var wrapPk = document.getElementById('wrapper_packing_panel');
        if (wrapPk) {
            if (!showPacking) {
                try {
                    var aePk = document.activeElement;
                    if (aePk && wrapPk.contains(aePk) && typeof aePk.blur === 'function') aePk.blur();
                } catch (_) {}
            }
            wrapPk.style.display = showPacking ? '' : 'none';
            wrapPk.setAttribute('aria-hidden', showPacking ? 'false' : 'true');
        }

        var wrapTk = document.getElementById('wrapper_thermoking_1');
        if (wrapTk) {
            if (!showTk) {
                try {
                    var aeTk = document.activeElement;
                    if (aeTk && wrapTk.contains(aeTk) && typeof aeTk.blur === 'function') aeTk.blur();
                } catch (_) {}
            }
            wrapTk.style.display = showTk ? '' : 'none';
            wrapTk.setAttribute('aria-hidden', showTk ? 'false' : 'true');
        }
        var wrapC5 = document.getElementById('wrapper_c5_1');
        if (wrapC5) {
            var showC5 = showA9 && rc5;
            if (!showC5) {
                try {
                    var aeC5 = document.activeElement;
                    if (aeC5 && wrapC5.contains(aeC5) && typeof aeC5.blur === 'function') aeC5.blur();
                } catch (_) {}
            }
            wrapC5.style.display = showC5 ? '' : 'none';
            wrapC5.setAttribute('aria-hidden', showC5 ? 'false' : 'true');
        }
        if (window.lucide && (showTk || showPacking || (showA9 && rc5))) {
            try {
                lucide.createIcons();
            } catch (e) {}
        }
        scheduleThermokingProgressRefresh();
        scheduleActualizarBloqueoSelectEnsayoFormatoPacking();
        scheduleActualizarBloqueoWrapperPackingPanelHoja();
        applyPackingRecepcionC5Layout();
    }

    (function bindThermokingFundoOptInOnce() {
        var chk = document.getElementById('chk_thermoking_habilitar');
        if (!chk || chk.dataset.boundTkOptin) return;
        chk.dataset.boundTkOptin = '1';
        chk.addEventListener('change', function () {
            syncThermoKingWrapperVisibility();
        });
    })();

    /** Cuando #wrapper_c5_1 está visible: abrir panel y scroll. */
    function applyPackingRecepcionC5Layout() {
        var c5wrap = document.getElementById('wrapper_c5_1');
        if (!c5wrap || c5wrap.style.display === 'none') return;
        var body = document.getElementById('body-c5-panel');
        var head = document.querySelector('[data-target="body-c5-panel"]');
        var chev = head ? head.querySelector('.thermoking-panel__chevron, .chevron') : null;
        if (body) body.style.display = 'block';
        if (chev) chev.classList.add('rotate');
        if (head) head.setAttribute('aria-expanded', 'true');
        setTimeout(function () {
            try {
                c5wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } catch (_) {}
        }, 80);
        if (window.lucide && typeof lucide.createIcons === 'function') {
            try {
                lucide.createIcons();
            } catch (_) {}
        }
    }

    /** Vacía datos de hoja (GET) hasta que el usuario pulse «Cargar datos». No rellenar con GET solo por cambiar el selector de ensayo. */
    function limpiarMetadataHojaPacking() {
        var viewIds = ['view_rotulo', 'view_etapa', 'view_campo', 'view_turno', 'view_placa', 'view_fundo', 'view_guia_despacho', 'view_variedad'];
        viewIds.forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.value = '';
        });
        var elEtapa = document.getElementById('view_etapa');
        var elCampo = document.getElementById('view_campo');
        if (elEtapa) elEtapa.removeAttribute('data-last-value');
        if (elCampo) elCampo.removeAttribute('data-last-value');
        var regVar = document.getElementById('reg_variedad');
        if (regVar) regVar.value = '';
        packingBloqueadoParaActual = false;
        if (btnGuardarPacking) btnGuardarPacking.disabled = packingEnviando;
        maxFilasPacking = 8;
        despachoPorFilaDesdeGET = {};
        numFilasEsperadoPorFechaEnsayo = {};
        prevFundoParaTkOptin = '';
        packingDatosCampoCargados = false;
        var chkLim = document.getElementById('chk_thermoking_habilitar');
        if (chkLim) chkLim.checked = false;
        syncThermoKingWrapperVisibility();
    }

    /** Rellena los campos de vista (solo lectura) y maxFilasPacking desde la respuesta del GET. Si tienePacking, bloquea envío. */
    function aplicarDatosVistaPacking(d, fromCache) {
        if (!d) return;
        console.log('[Packing] aplicarDatosVistaPacking: numFilas=' + (d.numFilas != null ? d.numFilas : 'n/a') + (fromCache ? ' (desde caché)' : ' (desde servidor)'));
        if (d.numFilas != null && d.numFilas > 0) maxFilasPacking = d.numFilas;
        if (typeof currentFechaPacking !== 'undefined' && typeof currentEnsayoPacking !== 'undefined') {
            var keyFeEn = keyPacking(currentFechaPacking, currentEnsayoPacking);
            if (keyFeEn) numFilasEsperadoPorFechaEnsayo[keyFeEn] = (d.numFilas != null && d.numFilas > 0) ? d.numFilas : null;
            if (keyFeEn && Array.isArray(d.despachoPorFila)) despachoPorFilaDesdeGET[keyFeEn] = d.despachoPorFila;
        }
        // Bloquear solo cuando packing y Recepción C5 ya están en la hoja (sigue permitiendo enviar C5 si packing existe pero C5 no).
        packingBloqueadoParaActual = d.tienePacking === true && d.tieneRecepcionC5 === true;
        if (btnGuardarPacking) {
            btnGuardarPacking.disabled = packingBloqueadoParaActual || packingEnviando;
            if (packingBloqueadoParaActual && typeof Swal !== 'undefined') {
                Swal.fire({
                    title: 'Ya trabajado',
                    text: 'Packing y Recepción C5 ya están guardados para esta fecha y ensayo. Elige otra fecha o ensayo.',
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
        set('view_fundo', d.FUNDO);
        set('view_guia_despacho', d.GUIA_REMISION);
        var nEnsayo = d.ENSAYO_NUMERO != null && d.ENSAYO_NUMERO !== '' ? String(d.ENSAYO_NUMERO).trim() : '';
        set('view_rotulo', nEnsayo ? nEnsayo + ' (Ensayo-' + nEnsayo + ')' : '');
        var variedadId = (d.VARIEDAD != null && d.VARIEDAD !== '') ? String(d.VARIEDAD).trim() : '';
        var variedadNombre = getNombreVariedad(d.VARIEDAD);
        var viewVar = document.getElementById('view_variedad');
        var regVar = document.getElementById('reg_variedad');
        if (viewVar) viewVar.value = variedadNombre;
        if (regVar) regVar.value = variedadId;
        packingDatosCampoCargados = true;
        syncThermoKingWrapperVisibility();
        scheduleRefrescarUiEstadoRc5();
        if (typeof actualizarBannerFormatoPacking === 'function') actualizarBannerFormatoPacking();
        scheduleActualizarBloqueoSelectEnsayoFormatoPacking();
        scheduleActualizarBloqueoWrapperPackingPanelHoja();
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
            (datosPacking.packing7 && datosPacking.packing7.length) || 0
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
        packing8: { observacion: '' }
    };

    /** Comprueba si en ESA sección se puede agregar otra fila. En formato-packing, primero debe existir al menos una fila en Packing 2 (Pesos). */
    function canAgregarFilaPacking(sectionKey) {
        const arr = datosPacking[sectionKey];
        if (!arr) return true;

        // Regla de negocio: primero registrar en Packing 2; luego recién el resto.
        if (sectionKey !== 'packing2' && datosPacking.packing2.length === 0) {
            Swal.fire({
                title: 'Primero: Peso bruto muestra',
                text: 'Primero registra al menos una fila en «Peso bruto muestra (Packing 2)» para poder registrar filas en los demás wrappers.',
                icon: 'warning',
                confirmButtonColor: '#2f7cc0'
            });
            return false;
        }

        if (sectionKey === 'packing1') {
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
        // wrapper_packing_3 a 8: su tope siempre es packing2.length.
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
        ['packing1', 'packing2', 'packing3', 'packing4', 'packing5', 'packing6', 'packing8'].forEach(k => {
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
        actualizarContadorPacking('next_clam_packing_obs', datosPacking.packing8.length);
        actualizarContadorPacking('next_clam_thermoking_temp', datosThermokingTemp.length);
        actualizarContadorPacking('next_clam_thermoking_obs', datosThermokingObs.length);
        actualizarContadorPacking('next_clam_thermoking_tiempos', datosThermokingTiempos.length);
        actualizarContadorPacking('next_clam_thermoking_peso', datosThermokingPesoTk.length);
        actualizarContadorPacking('next_clam_thermoking_humedad', datosThermokingHumedadTk.length);
        actualizarContadorPacking('next_clam_thermoking_presion', datosThermokingPresionTk.length);
        actualizarContadorPacking('next_clam_thermoking_vapor', datosThermokingVapor.length);
        actualizarContadorPacking('next_clam_packing_c5', datosC5.packing1_c5.length);
        actualizarContadorPacking('next_clam_pesos_c5', datosC5.packing2_c5.length);
        actualizarContadorPacking('next_clam_packing_temp_c5', datosC5.packing3_c5.length);
        actualizarContadorPacking('next_clam_packing_humedad_c5', datosC5.packing4_c5.length);
        actualizarContadorPacking('next_clam_packing_presion_c5', datosC5.packing5_c5.length);
        actualizarContadorPacking('next_clam_packing_presion_fruta_c5', datosC5.packing6_c5.length);
        actualizarContadorPacking('next_clam_packing_obs_c5', datosC5.packing8_c5.length);
        scheduleThermokingProgressRefresh();
    }

    function actualizarContadorPacking(contadorId, valor) {
        const el = document.getElementById(contadorId);
        if (el) el.textContent = valor + 1;
    }

    // Orden de columnas packing por fila lógica (36 valores datos): p1(5), p2(5), p3(10), p4(5), p5(5), p6(5), p8(1).
    // POST (Code.gs): Thermo King se aplanan 37 campos por fila de ensayo; C5, 38. La UI usa tablas con scroll, sin ancho mínimo artificial.
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
            const p8 = datosPacking.packing8[i] || {};
            const v = (x) => (x != null && x !== '') ? x : '';
            rows.push([
                v(p1.recepcion), v(p1.ingreso_gasificado), v(p1.salida_gasificado), v(p1.ingreso_prefrio), v(p1.salida_prefrio),
                v(p2.peso_recepcion), v(p2.peso_ingreso_gasificado), v(p2.peso_salida_gasificado), v(p2.peso_ingreso_prefrio), v(p2.peso_salida_prefrio),
                v(p3.t_amb_recep), v(p3.t_pulp_recep), v(p3.t_amb_ing), v(p3.t_pulp_ing), v(p3.t_amb_sal), v(p3.t_pulp_sal), v(p3.t_amb_pre_in), v(p3.t_pulp_pre_in), v(p3.t_amb_pre_out), v(p3.t_pulp_pre_out),
                v(p4.recepcion), v(p4.ingreso_gasificado), v(p4.salida_gasificado), v(p4.ingreso_prefrio), v(p4.salida_prefrio),
                v(p5.recepcion), v(p5.ingreso_gasificado), v(p5.salida_gasificado), v(p5.ingreso_prefrio), v(p5.salida_prefrio),
                v(p6.recepcion), v(p6.ingreso_gasificado), v(p6.salida_gasificado), v(p6.ingreso_prefrio), v(p6.salida_prefrio),
                v(p8.observacion)
            ]);
        }
        return rows;
    }

    function getPackingRowCountFromStored(stored) {
        if (!stored) return 0;
        var len = 0;
        /* packing8 (observaciones) no cuenta: puede ir vacío aunque haya filas en el resto. */
        ['packing1', 'packing2', 'packing3', 'packing4', 'packing5', 'packing6', 'packing7'].forEach(function (k) {
            var arr = stored[k];
            if (arr && arr.length > len) len = arr.length;
        });
        return len;
    }

    /** True si hay algo que enviar de Recepción C5 (merge cuando packing ya está en la hoja). */
    function tieneDatosC5ParaEnviar(stored) {
        if (!stored) return false;
        if ((stored.hora_inicio_recepcion_c5 != null && String(stored.hora_inicio_recepcion_c5).trim() !== '') ||
            valorResponsableC5DesdeStored(stored)) return true;
        var keys = ['packing1_c5', 'packing2_c5', 'packing3_c5', 'packing4_c5', 'packing5_c5', 'packing6_c5', 'packing8_c5'];
        for (var i = 0; i < keys.length; i++) {
            var arr = stored[keys[i]];
            if (Array.isArray(arr) && arr.length > 0) return true;
        }
        return false;
    }

    function getC5RowCountFromStored(stored) {
        if (!stored) return 0;
        var len = 0;
        /* packing8_c5 (observaciones) no cuenta frente a Visual / cantidad de muestras. */
        ['packing1_c5', 'packing2_c5', 'packing3_c5', 'packing4_c5', 'packing5_c5', 'packing6_c5'].forEach(function (k) {
            var arr = stored[k];
            if (arr && arr.length > len) len = arr.length;
        });
        return len;
    }

    function tieneDatosThermokingParaEnviar(stored) {
        if (!stored) return false;
        if ((stored.hora_salida_thermoking != null && String(stored.hora_salida_thermoking).trim() !== '') ||
            (stored.placa_thermoking != null && String(stored.placa_thermoking).trim() !== '')) return true;
        var keys = ['thermoking_tiempos', 'thermoking_peso', 'thermoking_temp', 'thermoking_humedad_tk', 'thermoking_presion_tk', 'thermoking_vapor', 'thermoking_obs'];
        for (var i = 0; i < keys.length; i++) {
            var arr = stored[keys[i]];
            if (Array.isArray(arr) && arr.length > 0) return true;
        }
        return false;
    }

    function getThermokingRowCountFromStored(stored) {
        if (!stored) return 0;
        return (stored.thermoking_peso && stored.thermoking_peso.length) || 0;
    }

    /** Comprueba que packing1 y 3–6 tengan la misma cantidad de filas que PACKING 2 (pesos). packing8 (observaciones) es independiente. */
    function validarConsistenciaFilasPacking(stored) {
        if (!stored) return { ok: true };
        var keys = ['packing1', 'packing2', 'packing3', 'packing4', 'packing5', 'packing6'];
        var lenBase = (stored.packing2 && stored.packing2.length) || 0;
        for (var i = 0; i < keys.length; i++) {
            var L = (stored[keys[i]] && stored[keys[i]].length) || 0;
            if (L !== lenBase) return { ok: false, base: 'packing2', lengths: keys.map(function (k) { return (stored[k] && stored[k].length) || 0; }) };
        }
        return { ok: true };
    }

    /** Al guardar/enviar packing: cada fila debe tener todos los inputs con data. Base de filas = PACKING 2 (pesos). */
    function validarPackingCompletoParaGuardar(stored) {
        if (!stored) return { ok: true };
        var n = (stored.packing2 && stored.packing2.length) || 0;
        if (n === 0) return { ok: true };
        var nombresSeccion = { packing1: 'Tiempos', packing2: 'Pesos', packing3: 'Temperatura', packing4: 'Humedad', packing5: 'Presión ambiente', packing6: 'Presión fruta' };
        var vacio = function (v) { return v === null || v === undefined || (typeof v === 'string' && v.trim() === ''); };
        for (var i = 0; i < n; i++) {
            var p1 = (stored.packing1 && stored.packing1[i]) || {};
            if (vacio(p1.recepcion) || vacio(p1.ingreso_gasificado) || vacio(p1.salida_gasificado) || vacio(p1.ingreso_prefrio) || vacio(p1.salida_prefrio)) return { ok: false, msg: 'Fila ' + (i + 1) + ': complete todos los campos de ' + nombresSeccion.packing1 + '.', fila: i + 1, seccion: 'Tiempos' };
            var p2 = (stored.packing2 && stored.packing2[i]) || {};
            if (vacio(p2.peso_recepcion) || vacio(p2.peso_ingreso_gasificado) || vacio(p2.peso_salida_gasificado) || vacio(p2.peso_ingreso_prefrio) || vacio(p2.peso_salida_prefrio)) return { ok: false, msg: 'Fila ' + (i + 1) + ': complete todos los campos de ' + nombresSeccion.packing2 + '.', fila: i + 1, seccion: 'Pesos' };
            var p3 = (stored.packing3 && stored.packing3[i]) || {};
            var campos3 = ['t_amb_recep', 't_pulp_recep', 't_amb_ing', 't_pulp_ing', 't_amb_sal', 't_pulp_sal', 't_amb_pre_in', 't_pulp_pre_in', 't_amb_pre_out', 't_pulp_pre_out'];
            for (var c = 0; c < campos3.length; c++) { if (vacio(p3[campos3[c]])) return { ok: false, msg: 'Fila ' + (i + 1) + ': complete todos los campos de ' + nombresSeccion.packing3 + '.', fila: i + 1, seccion: 'Temperatura' }; }
            var p4 = (stored.packing4 && stored.packing4[i]) || {};
            if (vacio(p4.recepcion) || vacio(p4.ingreso_gasificado) || vacio(p4.salida_gasificado) || vacio(p4.ingreso_prefrio) || vacio(p4.salida_prefrio)) return { ok: false, msg: 'Fila ' + (i + 1) + ': complete todos los campos de ' + nombresSeccion.packing4 + '.', fila: i + 1, seccion: 'Humedad' };
            var p5 = (stored.packing5 && stored.packing5[i]) || {};
            if (vacio(p5.recepcion) || vacio(p5.ingreso_gasificado) || vacio(p5.salida_gasificado) || vacio(p5.ingreso_prefrio) || vacio(p5.salida_prefrio)) return { ok: false, msg: 'Fila ' + (i + 1) + ': complete todos los campos de ' + nombresSeccion.packing5 + '.', fila: i + 1, seccion: 'Presión ambiente' };
            var p6 = (stored.packing6 && stored.packing6[i]) || {};
            if (vacio(p6.recepcion) || vacio(p6.ingreso_gasificado) || vacio(p6.salida_gasificado) || vacio(p6.ingreso_prefrio) || vacio(p6.salida_prefrio)) return { ok: false, msg: 'Fila ' + (i + 1) + ': complete todos los campos de ' + nombresSeccion.packing6 + '.', fila: i + 1, seccion: 'Presión fruta' };
            /* packing8 observación: opcional por fila */
        }
        return { ok: true };
    }

    /** Thermo King: todas las secciones deben tener la misma cantidad de filas tomando PESOS como base. */
    function validarConsistenciaFilasThermoking(stored) {
        if (!stored) return { ok: true };
        var keys = ['thermoking_tiempos', 'thermoking_peso', 'thermoking_temp', 'thermoking_humedad_tk', 'thermoking_presion_tk', 'thermoking_vapor', 'thermoking_obs'];
        var lenBase = (stored.thermoking_peso && stored.thermoking_peso.length) || 0;
        for (var i = 0; i < keys.length; i++) {
            var L = (stored[keys[i]] && stored[keys[i]].length) || 0;
            if (L !== lenBase) return { ok: false, base: 'thermoking_peso', lengths: keys.map(function (k) { return (stored[k] && stored[k].length) || 0; }) };
        }
        return { ok: true };
    }

    /** Thermo King: cada fila debe estar completa en todas sus secciones. Base de filas = thermoking_peso. */
    function validarThermokingCompletoParaGuardar(stored) {
        if (!stored) return { ok: true };
        var n = (stored.thermoking_peso && stored.thermoking_peso.length) || 0;
        if (n === 0) return { ok: true };
        var vacio = function (v) { return v === null || v === undefined || (typeof v === 'string' && v.trim() === ''); };
        for (var i = 0; i < n; i++) {
            var usarCamara = stored.thermoking_usar_camara_mp !== false;
            var t = (stored.thermoking_tiempos && stored.thermoking_tiempos[i]) || {};
            if (usarCamara && (vacio(t.ic) || vacio(t.st))) return { ok: false, msg: 'Fila ' + (i + 1) + ': complete todos los campos de Tiempos Thermo King.' };
            if (vacio(t.it) || vacio(t.dp)) return { ok: false, msg: 'Fila ' + (i + 1) + ': complete todos los campos obligatorios de Tiempos Thermo King.' };
            var p = (stored.thermoking_peso && stored.thermoking_peso[i]) || {};
            if (usarCamara && (vacio(p.ic) || vacio(p.st))) return { ok: false, msg: 'Fila ' + (i + 1) + ': complete todos los campos de Pesos Thermo King.' };
            if (vacio(p.it) || vacio(p.dp)) return { ok: false, msg: 'Fila ' + (i + 1) + ': complete todos los campos obligatorios de Pesos Thermo King.' };
            var te = (stored.thermoking_temp && stored.thermoking_temp[i]) || {};
            if (usarCamara) {
                var camposTempCam = ['ic_cm', 'ic_pu', 'st_cm', 'st_pu'];
                for (var cc = 0; cc < camposTempCam.length; cc++) if (vacio(te[camposTempCam[cc]])) return { ok: false, msg: 'Fila ' + (i + 1) + ': complete todos los campos de Temperatura Thermo King.' };
            }
            var camposTemp = ['it_amb', 'it_veh', 'it_pu', 'd_amb', 'd_veh', 'd_pu'];
            for (var c = 0; c < camposTemp.length; c++) if (vacio(te[camposTemp[c]])) return { ok: false, msg: 'Fila ' + (i + 1) + ': complete todos los campos de Temperatura Thermo King.' };
            var h = (stored.thermoking_humedad_tk && stored.thermoking_humedad_tk[i]) || {};
            if (usarCamara && (vacio(h.ic) || vacio(h.st))) return { ok: false, msg: 'Fila ' + (i + 1) + ': complete todos los campos de Humedad Thermo King.' };
            var campos6 = ['aei', 'ivi', 'aed', 'ivd'];
            for (var hI = 0; hI < campos6.length; hI++) if (vacio(h[campos6[hI]])) return { ok: false, msg: 'Fila ' + (i + 1) + ': complete todos los campos de Humedad Thermo King.' };
            var pr = (stored.thermoking_presion_tk && stored.thermoking_presion_tk[i]) || {};
            if (usarCamara && (vacio(pr.ic) || vacio(pr.st))) return { ok: false, msg: 'Fila ' + (i + 1) + ': complete todos los campos de Presión Thermo King.' };
            for (var pI = 0; pI < campos6.length; pI++) if (vacio(pr[campos6[pI]])) return { ok: false, msg: 'Fila ' + (i + 1) + ': complete todos los campos de Presión Thermo King.' };
            var v = (stored.thermoking_vapor && stored.thermoking_vapor[i]) || {};
            if (usarCamara && (vacio(v.ic) || vacio(v.scm))) return { ok: false, msg: 'Fila ' + (i + 1) + ': complete todos los campos de Presión de vapor fruta Thermo King.' };
            var camposVapor = ['it', 'st'];
            for (var vI = 0; vI < camposVapor.length; vI++) if (vacio(v[camposVapor[vI]])) return { ok: false, msg: 'Fila ' + (i + 1) + ': complete todos los campos de Presión de vapor fruta Thermo King.' };
            /* thermoking_obs: texto opcional por muestra */
        }
        return { ok: true };
    }

    var rafBloqueoSelEnsayoFmt = null;
    function scheduleActualizarBloqueoSelectEnsayoFormatoPacking() {
        if (rafBloqueoSelEnsayoFmt != null) return;
        rafBloqueoSelEnsayoFmt = requestAnimationFrame(function () {
            rafBloqueoSelEnsayoFmt = null;
            actualizarBloqueoSelectEnsayoFormatoPacking();
        });
    }

    /** #formato-packing: true si Packing está completo y, con Thermo King activado en el checkbox, TK también (misma lógica que enviar). */
    function ensayoFormatoPackingBloqueadoPorDatosCompletos(fecha, ensayoNum) {
        if (typeof currentSidebarView === 'undefined' || currentSidebarView !== 'formato-packing') return false;
        if (!fecha || ensayoNum === '' || ensayoNum == null) return false;
        var key = keyPacking(fecha, String(ensayoNum));
        var st = datosPackingPorEnsayo[key];
        if (!st) return false;
        var nPk = (st.packing2 && st.packing2.length) || 0;
        if (nPk === 0) return false;
        if (!validarConsistenciaFilasPacking(st).ok) return false;
        if (!validarPackingCompletoParaGuardar(st).ok) return false;
        var fundoEl = document.getElementById('view_fundo');
        var tieneFundoTk = fundoEl && String(fundoEl.value || '').trim() !== '';
        var chkTk = document.getElementById('chk_thermoking_habilitar');
        var tkOptIn = tieneFundoTk && chkTk && chkTk.checked && !chkTk.disabled;
        if (tkOptIn) {
            if (!tieneDatosThermokingParaEnviar(st)) return false;
            if (!validarConsistenciaFilasThermoking(st).ok) return false;
            if (!validarThermokingCompletoParaGuardar(st).ok) return false;
        }
        return true;
    }

    /** FUNDO por ensayo desde el GET (col. hoja) o, si falta, desde view_fundo. */
    function fundoEfectivoListaEnsayos_(res, ensayoNum) {
        if (!res) return '';
        var m = res.fundoPorEnsayo;
        if (m && typeof m === 'object') {
            var v = m[ensayoNum];
            if (v != null && String(v).trim() !== '') return String(v).trim().toUpperCase();
            v = m[String(ensayoNum)];
            if (v != null && String(v).trim() !== '') return String(v).trim().toUpperCase();
        }
        var fundoEl = document.getElementById('view_fundo');
        return fundoEl ? String(fundoEl.value || '').trim().toUpperCase() : '';
    }

    function tituloBloqueoFmtServidor_(res, ensayoNum) {
        var fd = fundoEfectivoListaEnsayos_(res, ensayoNum);
        if (fd && fd !== 'A9') return 'Packing ya registrado en hoja para este ensayo.';
        return 'Packing y Thermo King ya registrados en hoja para este ensayo.';
    }

    /**
     * #formato-packing: completo en hoja según getEnsayosPorFecha (mapas del res, no mezcla borrador).
     * A9 → packing + thermo; otro fundo conocido → solo packing; sin fundo en hoja ni form → exige también TK (evita bloquear solo con PK si TK está vacío en servidor).
     */
    function ensayoServidorTieneFormatoPackingCompleto(fecha, ensayoNum) {
        if (!fecha || ensayoNum === '' || ensayoNum == null) return false;
        var res = cacheEnsayosParaSelect.res;
        if (!res || !res.ok || cacheEnsayosParaSelect.fecha !== fecha) return false;
        if (!flagEnsayoEnMap_(res.ensayosConPacking, ensayoNum)) return false;
        var fd = fundoEfectivoListaEnsayos_(res, ensayoNum);
        var tk = flagEnsayoEnMap_(res.ensayosConThermoKing, ensayoNum);
        if (fd === 'A9') return tk;
        if (fd) return true;
        return tk;
    }

    /** #recepcion-c5: completo en hoja cuando Visual+Packing+ThermoKing+RecepciónC5 están en true. */
    function ensayoServidorTieneRecepcionC5Completo(fecha, ensayoNum) {
        if (!fecha || ensayoNum === '' || ensayoNum == null) return false;
        var res = cacheEnsayosParaSelect.res;
        if (!res || !res.ok || cacheEnsayosParaSelect.fecha !== fecha) return false;
        return flagEnsayoEnMap_(res.ensayosConVisual, ensayoNum) &&
            flagEnsayoEnMap_(res.ensayosConPacking, ensayoNum) &&
            flagEnsayoEnMap_(res.ensayosConThermoKing, ensayoNum) &&
            flagEnsayoEnMap_(res.ensayosConC5, ensayoNum);
    }

    function actualizarBloqueoSelectEnsayoFormatoPacking() {
        try {
            var sel = document.getElementById('view_ensayo_numero');
            var selRc5 = document.getElementById('view_ensayo_numero_rc5');
            if (!sel) return;
            var enFmt = typeof currentSidebarView !== 'undefined' && currentSidebarView === 'formato-packing';
            var enRc5 = typeof currentSidebarView !== 'undefined' && currentSidebarView === 'recepcion-c5';
            if (!enFmt && !enRc5) {
                if (sel.hasAttribute('data-blocked-fmt-pk-tk')) {
                    sel.removeAttribute('data-blocked-fmt-pk-tk');
                    if (!packingBloqueadoParaActual) {
                        sel.disabled = false;
                        sel.removeAttribute('title');
                    }
                }
                if (selRc5 && !packingBloqueadoParaActual) selRc5.disabled = false;
                return;
            }
            var fecha = inputFechaPacking && inputFechaPacking.value ? String(inputFechaPacking.value).trim() : '';
            var resSrv = cacheEnsayosParaSelect.res;
            if (fecha && cacheEnsayosParaSelect.fecha === fecha && resSrv && resSrv.ok) {
                for (var oi = 0; oi < sel.options.length; oi++) {
                    var op = sel.options[oi];
                    if (!op.value) {
                        op.disabled = false;
                        continue;
                    }
                    var bloqSrv = enRc5
                        ? ensayoServidorTieneRecepcionC5Completo(fecha, op.value)
                        : ensayoServidorTieneFormatoPackingCompleto(fecha, op.value);
                    op.disabled = bloqSrv;
                    op.title = bloqSrv
                        ? (enRc5
                            ? 'Visual, Packing, Thermo King y Recepción C5 ya están registrados en hoja para este ensayo.'
                            : tituloBloqueoFmtServidor_(resSrv, op.value))
                        : '';
                }
            } else {
                for (var oj = 0; oj < sel.options.length; oj++) {
                    var opj = sel.options[oj];
                    if (!opj.value) continue;
                    opj.disabled = false;
                    opj.title = '';
                }
            }
            if (packingBloqueadoParaActual) {
                sel.disabled = true;
                sel.removeAttribute('data-blocked-fmt-pk-tk');
                sel.setAttribute('title', 'Packing y Recepción C5 ya están guardados para esta fecha y ensayo. Elija otra fecha o ensayo.');
                if (selRc5) selRc5.disabled = true;
                return;
            }
            var ens = sel.value ? String(sel.value).trim() : '';
            if (fecha && cacheEnsayosParaSelect.fecha === fecha && resSrv && resSrv.ok && ens &&
                (enRc5 ? ensayoServidorTieneRecepcionC5Completo(fecha, ens) : ensayoServidorTieneFormatoPackingCompleto(fecha, ens))) {
                sel.disabled = true;
                sel.setAttribute('data-blocked-fmt-pk-tk', '1');
                sel.setAttribute('title', enRc5
                    ? 'Visual, Packing, Thermo King y Recepción C5 ya están registrados en hoja para este ensayo.'
                    : tituloBloqueoFmtServidor_(resSrv, ens));
                if (selRc5) selRc5.disabled = sel.disabled;
                if (typeof actualizarBannerFormatoPacking === 'function') actualizarBannerFormatoPacking();
                return;
            }
            if (enFmt && fecha && ens && ensayoFormatoPackingBloqueadoPorDatosCompletos(fecha, ens)) {
                sel.disabled = true;
                sel.setAttribute('data-blocked-fmt-pk-tk', '1');
                sel.setAttribute('title', 'Packing y Thermo King completos para este ensayo. Vacíe un campo o quite una fila para cambiar de ensayo.');
            } else {
                sel.disabled = false;
                sel.removeAttribute('data-blocked-fmt-pk-tk');
                sel.removeAttribute('title');
            }
            if (selRc5) selRc5.disabled = sel.disabled;
        } catch (e) {}
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
            var p8 = (stored.packing8 && stored.packing8[i]) || {};
            rows.push([
                v(p1.recepcion), v(p1.ingreso_gasificado), v(p1.salida_gasificado), v(p1.ingreso_prefrio), v(p1.salida_prefrio),
                v(p2.peso_recepcion), v(p2.peso_ingreso_gasificado), v(p2.peso_salida_gasificado), v(p2.peso_ingreso_prefrio), v(p2.peso_salida_prefrio),
                v(p3.t_amb_recep), v(p3.t_pulp_recep), v(p3.t_amb_ing), v(p3.t_pulp_ing), v(p3.t_amb_sal), v(p3.t_pulp_sal), v(p3.t_amb_pre_in), v(p3.t_pulp_pre_in), v(p3.t_amb_pre_out), v(p3.t_pulp_pre_out),
                v(p4.recepcion), v(p4.ingreso_gasificado), v(p4.salida_gasificado), v(p4.ingreso_prefrio), v(p4.salida_prefrio),
                v(p5.recepcion), v(p5.ingreso_gasificado), v(p5.salida_gasificado), v(p5.ingreso_prefrio), v(p5.salida_prefrio),
                v(p6.recepcion), v(p6.ingreso_gasificado), v(p6.salida_gasificado), v(p6.ingreso_prefrio), v(p6.salida_prefrio),
                v(p8.observacion)
            ]);
        }
        return rows;
    }

    // Limpia el formulario packing después de subida exitosa (como el primer POST). Sin internet el fetch falla y no se limpia.
    function limpiarFormularioPacking() {
        ['packing1', 'packing2', 'packing3', 'packing4', 'packing5', 'packing6', 'packing8'].forEach(k => { datosPacking[k] = []; });
        ['packing1_c5', 'packing2_c5', 'packing3_c5', 'packing4_c5', 'packing5_c5', 'packing6_c5', 'packing8_c5'].forEach(function (k) { datosC5[k] = []; });
        datosThermokingTemp = [];
        datosThermokingObs = [];
        datosThermokingTiempos = [];
        datosThermokingPesoTk = [];
        datosThermokingHumedadTk = [];
        datosThermokingPresionTk = [];
        datosThermokingVapor = [];
        renderAllPackingRows();
        var fi = document.getElementById('view_fecha_inspeccion');
        var resp = document.getElementById('view_responsable');
        var h = document.getElementById('view_hora_recepcion');
        var n = document.getElementById('view_n_viaje');
        if (fi) fi.value = '';
        if (resp) resp.value = '';
        if (h) h.value = '';
        if (n) n.value = '';
        var idsReg = ['reg_packing_recepcion','reg_packing_ingreso_gasificado','reg_packing_salida_gasificado','reg_packing_ingreso_prefrio','reg_packing_salida_prefrio','reg_packing_peso_recepcion','reg_packing_peso_ingreso_gasificado','reg_packing_peso_salida_gasificado','reg_packing_peso_ingreso_prefrio','reg_packing_peso_salida_prefrio','reg_packing_temp_amb_recepcion','reg_packing_temp_pulp_recepcion','reg_packing_temp_amb_ingreso_gas','reg_packing_temp_pulp_ingreso_gas','reg_packing_temp_amb_salida_gas','reg_packing_temp_pulp_salida_gas','reg_packing_temp_amb_ingreso_pre','reg_packing_temp_pulp_ingreso_pre','reg_packing_temp_amb_salida_pre','reg_packing_temp_pulp_salida_pre','reg_packing_humedad_recepcion','reg_packing_humedad_ingreso_gasificado','reg_packing_humedad_salida_gasificado','reg_packing_humedad_ingreso_prefrio','reg_packing_humedad_salida_prefrio','reg_packing_presion_recepcion','reg_packing_presion_ingreso_gasificado','reg_packing_presion_salida_gasificado','reg_packing_presion_ingreso_prefrio','reg_packing_presion_salida_prefrio','reg_packing_presion_fruta_recepcion','reg_packing_presion_fruta_ingreso_gasificado','reg_packing_presion_fruta_salida_gasificado','reg_packing_presion_fruta_ingreso_prefrio','reg_packing_presion_fruta_salida_prefrio','reg_packing_obs_texto','ingreso_camaraMP_tiempos_thermoking','salida_camaraMP_tiempos_thermoking','inicio_traslado_tiempos_thermoking','despacho_tiempos_thermoking','ingreso_camaraMP_peso_thermoking','salida_camaraMP_peso_thermoking','inicio_traslado_peso_thermoking','despacho_peso_thermoking','reg_tk_temp_ic_cm','reg_tk_temp_ic_pu','reg_tk_temp_st_cm','reg_tk_temp_st_pu','reg_tk_temp_it_amb','reg_tk_temp_it_veh','reg_tk_temp_it_pu','reg_tk_temp_d_amb','reg_tk_temp_d_veh','reg_tk_temp_d_pu','ingreso_camaraMP_humedad_thermoking','salida_traslado_humedad_thermoking','ambienteExt_inicio_humedad_thermoking','interior_vehiculo_inicio_thermoking','ambienteExt_despacho_thermoking','interior_vehiculo_despacho_thermoking','ingreso_camaraMP_presion_thermoking','salida_traslado_presion_thermoking','ambienteExt_inicio_presion_thermoking','interior_vehiculo_inicio_presion_thermoking','ambienteExt_despacho_presion_thermoking','interior_vehiculo_despacho_presion_thermoking','ingreso_camaraMP_vapor_thermoking','salida_camaraMP_vapor_thermoking','inicio_traslado_vapor_thermoking','salida_traslado_vapor_thermoking','reg_thermoking_obs_texto','hora_salida_thermoking','placa_thermoking','hora_inicio_recepcion_c5','responsable_c5','reg_packing_recepcion_c5','reg_packing_ingreso_gasificado_c5','reg_packing_salida_gasificado_c5','reg_packing_ingreso_prefrio_c5','reg_packing_salida_prefrio_c5','reg_packing_peso_recepcion_c5','reg_packing_peso_ingreso_gasificado_c5','reg_packing_peso_salida_gasificado_c5','reg_packing_peso_ingreso_prefrio_c5','reg_packing_peso_salida_prefrio_c5','reg_packing_temp_amb_recepcion_c5','reg_packing_temp_pulp_recepcion_c5','reg_packing_temp_amb_ingreso_gas_c5','reg_packing_temp_pulp_ingreso_gas_c5','reg_packing_temp_amb_salida_gas_c5','reg_packing_temp_pulp_salida_gas_c5','reg_packing_temp_amb_ingreso_pre_c5','reg_packing_temp_pulp_ingreso_pre_c5','reg_packing_temp_amb_salida_pre_c5','reg_packing_temp_pulp_salida_pre_c5','reg_packing_humedad_recepcion_c5','reg_packing_humedad_ingreso_gasificado_c5','reg_packing_humedad_salida_gasificado_c5','reg_packing_humedad_ingreso_prefrio_c5','reg_packing_humedad_salida_prefrio_c5','reg_packing_presion_recepcion_c5','reg_packing_presion_ingreso_gasificado_c5','reg_packing_presion_salida_gasificado_c5','reg_packing_presion_ingreso_prefrio_c5','reg_packing_presion_salida_prefrio_c5','reg_packing_presion_fruta_recepcion_c5','reg_packing_presion_fruta_ingreso_gasificado_c5','reg_packing_presion_fruta_salida_gasificado_c5','reg_packing_presion_fruta_ingreso_prefrio_c5','reg_packing_presion_fruta_salida_prefrio_c5','reg_packing_obs_texto_c5'];
        idsReg.forEach(function(id) { var el = document.getElementById(id); if (el) el.value = ''; });
    }

    /** Limpia toda la sección Packing: formulario + campos de vista + selects (tras envío exitoso). Si preservarFecha es true, mantiene fecha (y espejo RC5) para poder refrescar ensayos desde el servidor sin quedar en «sin fecha». */
    function limpiarTodoPacking(preservarFecha) {
        limpiarFormularioPacking();
        var viewIds = ['view_rotulo', 'view_etapa', 'view_campo', 'view_turno', 'view_placa', 'view_fundo', 'view_guia_despacho', 'view_variedad', 'view_fecha_inspeccion', 'view_responsable', 'view_hora_recepcion', 'view_n_viaje', 'view_ensayo_numero'];
        if (!preservarFecha) viewIds.push('view_fecha', 'view_fecha_rc5');
        viewIds.forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.value = '';
        });
        var regVar = document.getElementById('reg_variedad');
        if (regVar) regVar.value = '';
        actualizarTodosContadoresPacking();
        packingDatosCampoCargados = false;
        syncThermoKingWrapperVisibility();
        syncFechaEnsayoEspejoDesdePrimario();
    }

    /** Al cambiar la fecha: vacía vista y tablas packing para no mostrar datos de otro día; conserva view_fecha. */
    function limpiarDatosPackingAlCambiarFecha(fechaPreservar) {
        limpiarFormularioPacking();
        var viewIds = ['view_rotulo', 'view_etapa', 'view_campo', 'view_turno', 'view_placa', 'view_fundo', 'view_guia_despacho', 'view_variedad', 'view_fecha_inspeccion', 'view_responsable', 'view_hora_recepcion', 'view_n_viaje'];
        viewIds.forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.value = '';
        });
        var elEtapa = document.getElementById('view_etapa');
        var elCampo = document.getElementById('view_campo');
        if (elEtapa) elEtapa.removeAttribute('data-last-value');
        if (elCampo) elCampo.removeAttribute('data-last-value');
        var regVar = document.getElementById('reg_variedad');
        if (regVar) regVar.value = '';
        if (fechaPreservar && inputFechaPacking) inputFechaPacking.value = fechaPreservar;
        packingBloqueadoParaActual = false;
        if (btnGuardarPacking) btnGuardarPacking.disabled = packingEnviando;
        maxFilasPacking = 8;
        despachoPorFilaDesdeGET = {};
        actualizarTodosContadoresPacking();
        packingDatosCampoCargados = false;
        syncThermoKingWrapperVisibility();
        syncFechaEnsayoEspejoDesdePrimario();
    }

    /** Fecha inspección y Responsable: primero inputs compartidos (view_*), si vacío el store del ensayo. */
    function metaInspeccionResponsableParaPdf(fecha, ensayosAEnviar, datosPackingPorEnsayo) {
        var gv = function (id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };
        var fi = gv('view_fecha_inspeccion');
        var resp = gv('view_responsable');
        if (ensayosAEnviar && datosPackingPorEnsayo) {
            for (var mi = 0; mi < ensayosAEnviar.length; mi++) {
                var st = datosPackingPorEnsayo[keyPacking(fecha, String(ensayosAEnviar[mi]))];
                if (!st) continue;
                if (!fi && st.fecha_inspeccion) fi = String(st.fecha_inspeccion).trim();
                if (!resp && st.responsable) resp = String(st.responsable).trim();
            }
        }
        return { fechaInspeccion: fi, responsable: resp };
    }

    /** Hora inicio recep. (C5) y Responsable (C5) para PDF: un ensayo = valor directo; varios = «Ensayo: valor / …». */
    function resumenHoraResponsableC5ParaPdf(fecha, ensayosAEnviar, datosPackingPorEnsayo) {
        var v = function (x) { return (x != null && x !== '') ? String(x).trim() : ''; };
        var partes = [];
        for (var e = 0; e < ensayosAEnviar.length; e++) {
            var ens = ensayosAEnviar[e];
            var key = keyPacking(fecha, String(ens));
            var stored = datosPackingPorEnsayo[key];
            if (!stored || !tieneDatosC5ParaEnviar(stored)) continue;
            partes.push({ ens: ens, h: v(stored.hora_inicio_recepcion_c5), r: v(valorResponsableC5DesdeStored(stored)) });
        }
        if (partes.length === 0) return { horaInicioRecep: '—', responsableC5: '—' };
        if (partes.length === 1) return { horaInicioRecep: partes[0].h || '—', responsableC5: partes[0].r || '—' };
        var horaJoin = partes.map(function (p) { return String(p.ens) + ': ' + (p.h || '—'); }).join(' / ');
        var respJoin = partes.map(function (p) { return String(p.ens) + ': ' + (p.r || '—'); }).join(' / ');
        return { horaInicioRecep: horaJoin, responsableC5: respJoin };
    }

    /** Códigos de formato PDF (procedimiento interno). */
    var PDF_CODIGO_PACKING = 'PE-F-QPH-309';
    var PDF_CODIGO_THERMO_KING = 'PE-F-QPH-371';

    /** Genera PDF Calibrado Packing: mismo estilo que Visual. Datos del registro desde view_*; tablas desde datosPackingPorEnsayo. */
    function generarPDFPacking(fecha, ensayosAEnviar, datosPackingPorEnsayo) {
        if (!window.jspdf) {
            if (typeof Swal !== 'undefined') Swal.fire({
                title: 'PDF no disponible',
                html: 'La librería para generar el PDF no está cargada.',
                icon: 'warning',
                confirmButtonColor: '#2f7cc0'
            });
            return null;
        }
        var getView = function (id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };
        var metaPdf = metaInspeccionResponsableParaPdf(fecha, ensayosAEnviar, datosPackingPorEnsayo);
        var fechaInspeccion = metaPdf.fechaInspeccion;
        var responsable = metaPdf.responsable;
        var horaRecepcion = getView('view_hora_recepcion');
        var rotulo = getView('view_rotulo') || ('Ensayo ' + ensayosAEnviar.join(', Ensayo '));
        var etapa = getView('view_etapa');
        var campo = getView('view_campo');
        var turno = getView('view_turno');
        var ubicacion = [etapa, campo, turno].filter(Boolean).join(' / ') || '—';
        var variedad = getView('view_variedad');
        var fundo = getView('view_fundo');
        var placa = getView('view_placa');
        var guiaDespacho = getView('view_guia_despacho');
        var nViaje = getView('view_n_viaje');

        var v = function (x) { return (x != null && x !== '') ? String(x).trim() : ''; };
        var rowsP1 = [], rowsP2 = [], rowsP3 = [], rowsP4 = [], rowsP5 = [], rowsP6 = [], rowsP8 = [];
        for (var e = 0; e < ensayosAEnviar.length; e++) {
            var key = keyPacking(fecha, String(ensayosAEnviar[e]));
            var stored = datosPackingPorEnsayo[key];
            if (!stored) continue;
            var n = getPackingRowCountFromStored(stored);
            for (var i = 0; i < n; i++) {
                var p1 = (stored.packing1 && stored.packing1[i]) || {};
                var p2 = (stored.packing2 && stored.packing2[i]) || {};
                var p3 = (stored.packing3 && stored.packing3[i]) || {};
                var p4 = (stored.packing4 && stored.packing4[i]) || {};
                var p5 = (stored.packing5 && stored.packing5[i]) || {};
                var p6 = (stored.packing6 && stored.packing6[i]) || {};
                var p8 = (stored.packing8 && stored.packing8[i]) || {};
                rowsP1.push([ensayosAEnviar[e], i + 1, v(p1.recepcion), v(p1.ingreso_gasificado), v(p1.salida_gasificado), v(p1.ingreso_prefrio), v(p1.salida_prefrio)]);
                rowsP2.push([ensayosAEnviar[e], i + 1, v(p2.peso_recepcion), v(p2.peso_ingreso_gasificado), v(p2.peso_salida_gasificado), v(p2.peso_ingreso_prefrio), v(p2.peso_salida_prefrio)]);
                rowsP3.push([ensayosAEnviar[e], i + 1, v(p3.t_amb_recep), v(p3.t_pulp_recep), v(p3.t_amb_ing), v(p3.t_pulp_ing), v(p3.t_amb_sal), v(p3.t_pulp_sal), v(p3.t_amb_pre_in), v(p3.t_pulp_pre_in), v(p3.t_amb_pre_out), v(p3.t_pulp_pre_out)]);
                rowsP4.push([ensayosAEnviar[e], i + 1, v(p4.recepcion), v(p4.ingreso_gasificado), v(p4.salida_gasificado), v(p4.ingreso_prefrio), v(p4.salida_prefrio)]);
                rowsP5.push([ensayosAEnviar[e], i + 1, v(p5.recepcion), v(p5.ingreso_gasificado), v(p5.salida_gasificado), v(p5.ingreso_prefrio), v(p5.salida_prefrio)]);
                rowsP6.push([ensayosAEnviar[e], i + 1, v(p6.recepcion), v(p6.ingreso_gasificado), v(p6.salida_gasificado), v(p6.ingreso_prefrio), v(p6.salida_prefrio)]);
                rowsP8.push([ensayosAEnviar[e], i + 1, (p8.observacion != null && p8.observacion !== '') ? String(p8.observacion).substring(0, 45) : '']);
            }
        }

        try {
            var JsPDF = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : window.jspdf;
            var doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            var pageW = doc.internal.pageSize.getWidth();
            var contentWidth = 180;
            var margin = (pageW - contentWidth) / 2;
            var marginTopInicial = 14;
            var y = marginTopInicial;
            var fontSize = 9;
            var headerH = 18;
            var headerLeftW = 36;
            var headerRightW = 36;
            var headerCenterW = contentWidth - headerLeftW - headerRightW;
            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.3);
            doc.rect(margin, y, headerLeftW, headerH);
            doc.setFontSize(10);
            doc.setFont(undefined, 'bold');
            doc.text('AGROVISION', margin + headerLeftW / 2, y + headerH / 2 + 1.5, { align: 'center' });
            doc.rect(margin + headerLeftW, y, headerCenterW, headerH);
            var tituloEncabezado = 'FORMATO MEDICIÓN DE TIEMPOS, TEMPERATURA Y PESOS EN COSECHA ARÁNDANO- C5-C6-A9-LN';
            doc.setFontSize(7);
            var lineasTitulo = doc.splitTextToSize(tituloEncabezado, headerCenterW - 4);
            var tituloY = y + (headerH - (lineasTitulo.length * 3.5)) / 2 + 2.5;
            lineasTitulo.forEach(function (line, i) {
                doc.text(line, margin + headerLeftW + headerCenterW / 2, tituloY + i * 3.5, { align: 'center' });
            });
            doc.rect(margin + headerLeftW + headerCenterW, y, headerRightW, headerH);
            doc.setFont(undefined, 'normal');
            doc.setFontSize(8);
            doc.text('Código: ' + PDF_CODIGO_PACKING, margin + contentWidth - headerRightW + 2, y + 5, { align: 'left' });
            doc.text('Versión: 1', margin + contentWidth - headerRightW + 2, y + 9.5, { align: 'left' });
            var now = new Date();
            var genStr = 'Generado: ' + now.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
            doc.setFontSize(6);
            doc.text(genStr, margin + contentWidth - headerRightW + 2, y + 14.5, { align: 'left' });
            y += headerH + 3;

            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.2);
            var paddingTopDatos = 5;
            var titleDatosH = 5;
            var rowHDatos = 5.2;
            var numRowsDatos = 6;
            var paddingBottomDatos = 1;
            var blockH = paddingTopDatos + titleDatosH + numRowsDatos * rowHDatos + paddingBottomDatos;
            var yDatosStart = y;
            doc.rect(margin, y, contentWidth, blockH);
            y += paddingTopDatos;
            var bullet = '\u2022';
            doc.setFontSize(8);
            doc.setFont(undefined, 'bold');
            doc.text('Datos del registro', margin + contentWidth / 2, y, { align: 'center' });
            y += titleDatosH;
            doc.setFont(undefined, 'normal');
            var camposPDF = [
                { label: 'Tipo de Medición', value: 'Calibrado Packing' },
                { label: 'Fecha Inspección', value: fechaInspeccion || '—' },
                { label: 'Responsable', value: responsable || '—' },
                { label: 'Hora Recepción', value: horaRecepcion || '—' },
                { label: 'Rótulo / Ensayos', value: rotulo },
                { label: 'Ubicación (Etapa/Campo/Turno)', value: ubicacion },
                { label: 'Variedad', value: variedad || '—' },
                { label: 'Fundo', value: fundo || '—' },
                { label: 'N° Placa Camioneta', value: placa || '—' },
                { label: 'N° Guía Despacho', value: guiaDespacho || '—' },
                { label: 'N° Viaje', value: nViaje || '—' }
            ];
            var colW = contentWidth / 2;
            var leftX = margin + 3;
            var rightX = margin + colW + 3;
            for (var c = 0; c < camposPDF.length; c += 2) {
                var c0 = camposPDF[c];
                var c1 = camposPDF[c + 1];
                doc.setFont(undefined, 'normal');
                doc.text(bullet + ' ' + c0.label + ': ', leftX, y);
                doc.setFont(undefined, 'bold');
                doc.text((c0.value || '—').substring(0, 22), leftX + doc.getTextWidth(bullet + ' ' + c0.label + ': '), y);
                if (c1) {
                    doc.setFont(undefined, 'normal');
                    doc.text(bullet + ' ' + c1.label + ': ', rightX, y);
                    doc.setFont(undefined, 'bold');
                    doc.text((c1.value || '—').substring(0, 22), rightX + doc.getTextWidth(bullet + ' ' + c1.label + ': '), y);
                }
                y += rowHDatos;
            }
            y = yDatosStart + blockH + 2;

            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.4);
            var lineH = 6;
            var yMax = 272;
            var marginTopNuevaPagina = 12;
            function drawTablePacking(titulo, headers, dataRows) {
                var rows = (dataRows || []).slice(0, 15);
                var totalTableH = (1 + rows.length) * lineH;
                var sectionH = 4 + 3 + totalTableH + 2;
                if (y + sectionH > yMax) {
                    doc.addPage();
                    y = marginTopNuevaPagina;
                }
                y += 3;
                doc.setFontSize(fontSize);
                doc.setFont(undefined, 'bold');
                doc.text(titulo, margin, y, { align: 'left' });
                y += 2;
                doc.setFont(undefined, 'normal');
                var nCol = headers.length;
                var tableColW = contentWidth / Math.max(nCol, 1);
                var totalH = (1 + rows.length) * lineH;
                var startY = y;
                doc.rect(margin, startY, contentWidth, totalH);
                for (var c = 1; c < nCol; c++) doc.line(margin + c * tableColW, startY, margin + c * tableColW, startY + totalH);
                for (var r = 0; r <= rows.length + 1; r++) doc.line(margin, startY + r * lineH, margin + contentWidth, startY + r * lineH);
                var headerFont = nCol >= 8 ? 5.5 : (nCol > 6 ? 6 : 7);
                doc.setFontSize(headerFont);
                headers.forEach(function (h, i) { doc.text(h, margin + i * tableColW + tableColW / 2, startY + lineH / 2 + 1.2, { align: 'center' }); });
                var cellFont = nCol >= 8 ? 7 : (nCol > 6 ? 7 : 8);
                doc.setFontSize(cellFont);
                y = startY + lineH;
                rows.forEach(function (row) {
                    (row || []).forEach(function (val, i) {
                        if (i < nCol) doc.text(String(val || '').substring(0, 12), margin + i * tableColW + tableColW / 2, y + lineH / 2 + 1.2, { align: 'center' });
                    });
                    y += lineH;
                });
                doc.setFontSize(fontSize);
                y += 1;
            }
            drawTablePacking('1. Tiempos de la muestra', ['Ensayo', 'N°', 'RECEP.', 'IN. GAS.', 'OUT GAS.', 'IN. PRE.', 'OUT PRE.'], rowsP1);
            drawTablePacking('2. Pesos', ['Ensayo', 'N°', 'PESO RECEP.', 'PESO IN.GAS', 'PESO OUT.G', 'PESO IN.PR', 'PESO OUT.P'], rowsP2);
            drawTablePacking('3. Temperatura muestra', ['Ensayo', 'N°', 'T.AMB R', 'T.PUL R', 'T.AMB IN', 'T.PUL IN', 'T.AMB S', 'T.PUL S', 'T.AMB PI', 'T.PUL PI', 'T.AMB PO', 'T.PUL PO'], rowsP3);
            drawTablePacking('4. Humedad', ['Ensayo', 'N°', 'RECEP.', 'IN. GAS.', 'OUT GAS.', 'IN. PRE.', 'OUT PRE.'], rowsP4);
            drawTablePacking('5. Presión ambiente', ['Ensayo', 'N°', 'RECEP.', 'IN. GAS.', 'OUT GAS.', 'IN. PRE.', 'OUT PRE.'], rowsP5);
            drawTablePacking('6. Presión fruta', ['Ensayo', 'N°', 'RECEP.', 'IN. GAS.', 'OUT GAS.', 'IN. PRE.', 'OUT PRE.'], rowsP6);
            drawTablePacking('7. Observaciones por muestra', ['Ensayo', 'N°', 'OBSERVACIÓN'], rowsP8);

            var nombreArchivo = 'MTTP_Packing_' + (fecha || 'fecha') + '_Ensayo' + (ensayosAEnviar.join('-')) + '.pdf';
            var blob = doc.output('blob');
            return { blobUrl: URL.createObjectURL(blob), nombreArchivo: nombreArchivo };
        } catch (err) {
            console.error(err);
            if (typeof Swal !== 'undefined') Swal.fire({ title: 'Error', text: 'No se pudo generar el PDF.', icon: 'error' });
            return null;
        }
    }

    /** PDF Thermo King: meta + tablas desde datos guardados por fecha/ensayo (misma base que envío). */
    function generarPDFThermoKing(fecha, ensayosAEnviar, datosPackingPorEnsayo) {
        if (!window.jspdf) {
            if (typeof Swal !== 'undefined') Swal.fire({ title: 'PDF no disponible', html: 'La librería para generar el PDF no está cargada.', icon: 'warning', confirmButtonColor: '#2f7cc0' });
            return null;
        }
        var getView = function (id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };
        var v = function (x) { return (x != null && x !== '') ? String(x).trim() : ''; };
        var rowsMeta = [], rowsTiempos = [], rowsPeso = [], rowsTemp = [], rowsHum = [], rowsPr = [], rowsVap = [], rowsObs = [];
        for (var e = 0; e < ensayosAEnviar.length; e++) {
            var ens = ensayosAEnviar[e];
            var key = keyPacking(fecha, String(ens));
            var stored = datosPackingPorEnsayo[key];
            if (!stored || !tieneDatosThermokingParaEnviar(stored)) continue;
            rowsMeta.push([ens, v(stored.hora_salida_thermoking), v(stored.placa_thermoking)]);
            var n = (stored.thermoking_peso && stored.thermoking_peso.length) || 0;
            for (var i = 0; i < n; i++) {
                var tt = (stored.thermoking_tiempos && stored.thermoking_tiempos[i]) || {};
                var pp = (stored.thermoking_peso && stored.thermoking_peso[i]) || {};
                var te = (stored.thermoking_temp && stored.thermoking_temp[i]) || {};
                var h = (stored.thermoking_humedad_tk && stored.thermoking_humedad_tk[i]) || {};
                var pr = (stored.thermoking_presion_tk && stored.thermoking_presion_tk[i]) || {};
                var va = (stored.thermoking_vapor && stored.thermoking_vapor[i]) || {};
                var ob = (stored.thermoking_obs && stored.thermoking_obs[i]) || {};
                rowsTiempos.push([ens, i + 1, v(tt.ic), v(tt.st), v(tt.it), v(tt.dp)]);
                rowsPeso.push([ens, i + 1, v(pp.ic), v(pp.st), v(pp.it), v(pp.dp)]);
                rowsTemp.push([ens, i + 1, v(te.ic_cm), v(te.ic_pu), v(te.st_cm), v(te.st_pu), v(te.it_amb), v(te.it_veh), v(te.it_pu), v(te.d_amb), v(te.d_veh), v(te.d_pu)]);
                rowsHum.push([ens, i + 1, v(h.ic), v(h.st), v(h.aei), v(h.ivi), v(h.aed), v(h.ivd)]);
                rowsPr.push([ens, i + 1, v(pr.ic), v(pr.st), v(pr.aei), v(pr.ivi), v(pr.aed), v(pr.ivd)]);
                rowsVap.push([ens, i + 1, v(va.ic), v(va.scm), v(va.it), v(va.st)]);
                rowsObs.push([ens, i + 1, (ob.observacion != null && String(ob.observacion).trim() !== '') ? String(ob.observacion).substring(0, 40) : '']);
            }
        }
        if (rowsTiempos.length === 0) {
            if (typeof Swal !== 'undefined') Swal.fire({ title: 'Sin datos Thermo King', text: 'No hay filas de Thermo King para esta selección.', icon: 'info', confirmButtonColor: '#2f7cc0' });
            return null;
        }
        try {
            var metaTk = metaInspeccionResponsableParaPdf(fecha, ensayosAEnviar, datosPackingPorEnsayo);
            var fechaInspeccion = metaTk.fechaInspeccion || '';
            var responsable = metaTk.responsable || '';
            var rotulo = getView('view_rotulo') || ('Ensayo ' + ensayosAEnviar.join(', Ensayo '));
            var JsPDF = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : window.jspdf;
            var doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            var pageW = doc.internal.pageSize.getWidth();
            var contentWidth = 180;
            var margin = (pageW - contentWidth) / 2;
            var y = 14;
            var fontSize = 9;
            var headerH = 18;
            var headerLeftW = 36;
            var headerRightW = 36;
            var headerCenterW = contentWidth - headerLeftW - headerRightW;
            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.3);
            doc.rect(margin, y, headerLeftW, headerH);
            doc.setFontSize(10);
            doc.setFont(undefined, 'bold');
            doc.text('AGROVISION', margin + headerLeftW / 2, y + headerH / 2 + 1.5, { align: 'center' });
            doc.rect(margin + headerLeftW, y, headerCenterW, headerH);
            doc.setFontSize(7);
            var tituloEncabezado = 'THERMO KING — Mediciones complementarias (Fundo A9)';
            var lineasTitulo = doc.splitTextToSize(tituloEncabezado, headerCenterW - 4);
            var tituloY = y + (headerH - (lineasTitulo.length * 3.5)) / 2 + 2.5;
            lineasTitulo.forEach(function (line, i) {
                doc.text(line, margin + headerLeftW + headerCenterW / 2, tituloY + i * 3.5, { align: 'center' });
            });
            doc.rect(margin + headerLeftW + headerCenterW, y, headerRightW, headerH);
            doc.setFont(undefined, 'normal');
            doc.setFontSize(8);
            doc.text('Código: ' + PDF_CODIGO_THERMO_KING, margin + contentWidth - headerRightW + 2, y + 5, { align: 'left' });
            doc.text('Versión: 1', margin + contentWidth - headerRightW + 2, y + 9.5, { align: 'left' });
            var nowTk = new Date();
            var genStrTk = 'Generado: ' + nowTk.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + nowTk.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
            doc.setFontSize(6);
            doc.text(genStrTk, margin + contentWidth - headerRightW + 2, y + 14.5, { align: 'left' });
            y += headerH + 3;

            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.2);
            var paddingTopDatos = 5;
            var titleDatosH = 5;
            var rowHDatos = 5.2;
            var numRowsDatos = 3;
            var paddingBottomDatos = 1;
            var blockH = paddingTopDatos + titleDatosH + numRowsDatos * rowHDatos + paddingBottomDatos;
            var yDatosStart = y;
            doc.rect(margin, y, contentWidth, blockH);
            y += paddingTopDatos;
            var bullet = '\u2022';
            doc.setFontSize(8);
            doc.setFont(undefined, 'bold');
            doc.text('Datos del registro', margin + contentWidth / 2, y, { align: 'center' });
            y += titleDatosH;
            doc.setFont(undefined, 'normal');
            var camposPDFTk = [
                { label: 'Tipo', value: 'Thermo King' },
                { label: 'Fecha registro', value: fecha || '—' },
                { label: 'Fecha Inspección', value: fechaInspeccion || '—' },
                { label: 'Responsable', value: responsable || '—' },
                { label: 'Rótulo / Ensayos', value: rotulo || '—' }
            ];
            var colW = contentWidth / 2;
            var leftX = margin + 3;
            var rightX = margin + colW + 3;
            for (var ctk = 0; ctk < camposPDFTk.length; ctk += 2) {
                var c0 = camposPDFTk[ctk];
                var c1 = camposPDFTk[ctk + 1];
                doc.setFont(undefined, 'normal');
                doc.text(bullet + ' ' + c0.label + ': ', leftX, y);
                doc.setFont(undefined, 'bold');
                doc.text((c0.value || '—').substring(0, 22), leftX + doc.getTextWidth(bullet + ' ' + c0.label + ': '), y);
                if (c1) {
                    doc.setFont(undefined, 'normal');
                    doc.text(bullet + ' ' + c1.label + ': ', rightX, y);
                    doc.setFont(undefined, 'bold');
                    doc.text((c1.value || '—').substring(0, 22), rightX + doc.getTextWidth(bullet + ' ' + c1.label + ': '), y);
                }
                y += rowHDatos;
            }
            y = yDatosStart + blockH + 2;
            y += 5;

            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.4);
            var lineH = 6;
            var yMax = 287;
            var marginTopNuevaPagina = 12;
            /* Mismo hueco: debajo del cuadro de tabla y entre el título (o leyenda) y el borde superior del cuadro siguiente. */
            var gapEntreBloquesTk = 4;
            var leyendaCampoTk = 'Es información de campo; datos solo para visualizar.';
            function drawTableTk(titulo, headers, dataRows, leyendaCampo) {
                var rows = (dataRows || []).slice(0, 20);
                var nCol = headers.length;
                var totalTableH = (1 + rows.length) * lineH;
                var overheadTituloYTabla = leyendaCampo ? 22 : (8 + gapEntreBloquesTk);
                if (y + overheadTituloYTabla + totalTableH > yMax) { doc.addPage(); y = marginTopNuevaPagina; }
                doc.setFontSize(fontSize);
                doc.setFont(undefined, 'bold');
                doc.text(titulo, margin, y, { align: 'left' });
                if (leyendaCampo) {
                    y += 2.6;
                    doc.setFontSize(5.5);
                    doc.setFont(undefined, 'italic');
                    doc.setTextColor(75, 85, 99);
                    var leyLines = doc.splitTextToSize(leyendaCampo, contentWidth - 4);
                    leyLines.forEach(function (ln, li) {
                        doc.text(ln, margin, y + li * 3.1, { align: 'left' });
                    });
                    y += leyLines.length * 3.1 + gapEntreBloquesTk;
                    doc.setTextColor(0, 0, 0);
                    doc.setFont(undefined, 'normal');
                    doc.setFontSize(fontSize);
                } else {
                    y += gapEntreBloquesTk;
                }
                doc.setFont(undefined, 'normal');
                var tableColW = contentWidth / Math.max(nCol, 1);
                var totalH = (1 + rows.length) * lineH;
                var startY = y;
                doc.rect(margin, startY, contentWidth, totalH);
                for (var ci = 1; ci < nCol; ci++) doc.line(margin + ci * tableColW, startY, margin + ci * tableColW, startY + totalH);
                for (var r = 0; r <= rows.length + 1; r++) doc.line(margin, startY + r * lineH, margin + contentWidth, startY + r * lineH);
                var headerFont = nCol >= 10 ? 5 : (nCol > 7 ? 5.5 : 6.5);
                doc.setFontSize(headerFont);
                headers.forEach(function (h, i) { doc.text(h, margin + i * tableColW + tableColW / 2, startY + lineH / 2 + 1.2, { align: 'center' }); });
                doc.setFontSize(nCol >= 10 ? 6 : 7);
                y = startY + lineH;
                rows.forEach(function (row) {
                    (row || []).forEach(function (val, i) {
                        if (i < nCol) doc.text(String(val || '').substring(0, nCol > 10 ? 8 : 11), margin + i * tableColW + tableColW / 2, y + lineH / 2 + 1.2, { align: 'center' });
                    });
                    y += lineH;
                });
                doc.setFontSize(fontSize);
                y += gapEntreBloquesTk;
            }
            drawTableTk('Meta Thermo King por ensayo', ['Ensayo', 'Hora salida frío', 'Placa'], rowsMeta, leyendaCampoTk);
            drawTableTk('Tiempos (hora)', ['Ens.', 'N°', 'Ing.MP', 'Sal.MP', 'Inic.T-H', 'Desp.'], rowsTiempos);
            drawTableTk('Pesos (g)', ['Ens.', 'N°', 'Ing.MP', 'Sal.MP', 'Inic.T-H', 'Desp.'], rowsPeso);
            drawTableTk('Temperatura (°C)', ['E', 'N', 'ICc', 'ICp', 'STc', 'STp', 'ITa', 'ITv', 'ITp', 'Da', 'Dv', 'Dp'], rowsTemp);
            drawTableTk('Humedad (%)', ['Ens.', 'N°', 'IC', 'ST', 'AEi', 'IVi', 'AEd', 'IVd'], rowsHum);
            drawTableTk('Presión vapor amb. (Kpa)', ['Ens.', 'N°', 'IC', 'ST', 'AEi', 'IVi', 'AEd', 'IVd'], rowsPr);
            drawTableTk('Presión vapor fruta (Kpa)', ['Ens.', 'N°', 'IC', 'STc', 'Inic', 'Sal'], rowsVap);
            drawTableTk('Observaciones', ['Ensayo', 'N°', 'Observación'], rowsObs);
            var nombreArchivo = 'MTTP_ThermoKing_' + (fecha || 'fecha') + '_Ensayo' + ensayosAEnviar.join('-') + '.pdf';
            return { blobUrl: URL.createObjectURL(doc.output('blob')), nombreArchivo: nombreArchivo };
        } catch (err) {
            console.error(err);
            if (typeof Swal !== 'undefined') Swal.fire({ title: 'Error', text: 'No se pudo generar el PDF Thermo King.', icon: 'error' });
            return null;
        }
    }

    /** PDF Recepción C5: meta + tablas C5 (misma forma que packing principal). */
    function generarPDFRecepcionC5(fecha, ensayosAEnviar, datosPackingPorEnsayo) {
        if (!window.jspdf) {
            if (typeof Swal !== 'undefined') Swal.fire({ title: 'PDF no disponible', html: 'La librería para generar el PDF no está cargada.', icon: 'warning', confirmButtonColor: '#2f7cc0' });
            return null;
        }
        var getView = function (id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };
        var v = function (x) { return (x != null && x !== '') ? String(x).trim() : ''; };
        var rowsP1 = [], rowsP2 = [], rowsP3 = [], rowsP4 = [], rowsP5 = [], rowsP6 = [], rowsP8 = [];
        var hayAlguno = false;
        for (var e = 0; e < ensayosAEnviar.length; e++) {
            var ens = ensayosAEnviar[e];
            var key = keyPacking(fecha, String(ens));
            var stored = datosPackingPorEnsayo[key];
            if (!stored || !tieneDatosC5ParaEnviar(stored)) continue;
            hayAlguno = true;
            var n = getC5RowCountFromStored(stored);
            for (var i = 0; i < n; i++) {
                var p1 = (stored.packing1_c5 && stored.packing1_c5[i]) || {};
                var p2 = (stored.packing2_c5 && stored.packing2_c5[i]) || {};
                var p3 = (stored.packing3_c5 && stored.packing3_c5[i]) || {};
                var p4 = (stored.packing4_c5 && stored.packing4_c5[i]) || {};
                var p5 = (stored.packing5_c5 && stored.packing5_c5[i]) || {};
                var p6 = (stored.packing6_c5 && stored.packing6_c5[i]) || {};
                var p8 = (stored.packing8_c5 && stored.packing8_c5[i]) || {};
                rowsP1.push([ens, i + 1, v(p1.recepcion), v(p1.ingreso_gasificado), v(p1.salida_gasificado), v(p1.ingreso_prefrio), v(p1.salida_prefrio)]);
                rowsP2.push([ens, i + 1, v(p2.peso_recepcion), v(p2.peso_ingreso_gasificado), v(p2.peso_salida_gasificado), v(p2.peso_ingreso_prefrio), v(p2.peso_salida_prefrio)]);
                rowsP3.push([ens, i + 1, v(p3.t_amb_recep), v(p3.t_pulp_recep), v(p3.t_amb_ing), v(p3.t_pulp_ing), v(p3.t_amb_sal), v(p3.t_pulp_sal), v(p3.t_amb_pre_in), v(p3.t_pulp_pre_in), v(p3.t_amb_pre_out), v(p3.t_pulp_pre_out)]);
                rowsP4.push([ens, i + 1, v(p4.recepcion), v(p4.ingreso_gasificado), v(p4.salida_gasificado), v(p4.ingreso_prefrio), v(p4.salida_prefrio)]);
                rowsP5.push([ens, i + 1, v(p5.recepcion), v(p5.ingreso_gasificado), v(p5.salida_gasificado), v(p5.ingreso_prefrio), v(p5.salida_prefrio)]);
                rowsP6.push([ens, i + 1, v(p6.recepcion), v(p6.ingreso_gasificado), v(p6.salida_gasificado), v(p6.ingreso_prefrio), v(p6.salida_prefrio)]);
                rowsP8.push([ens, i + 1, (p8.observacion != null && p8.observacion !== '') ? String(p8.observacion).substring(0, 45) : '']);
            }
        }
        if (!hayAlguno || rowsP1.length === 0) {
            if (typeof Swal !== 'undefined') Swal.fire({ title: 'Sin datos Recepción C5', text: 'No hay filas de Recepción C5 para esta selección.', icon: 'info', confirmButtonColor: '#2f7cc0' });
            return null;
        }
        try {
            var JsPDF = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : window.jspdf;
            var doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            var pageW = doc.internal.pageSize.getWidth();
            var contentWidth = 180;
            var margin = (pageW - contentWidth) / 2;
            var y = 14;
            var fontSize = 9;
            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.3);
            doc.rect(margin, y, 36, 18);
            doc.setFontSize(10);
            doc.setFont(undefined, 'bold');
            doc.text('AGROVISION', margin + 18, y + 11, { align: 'center' });
            doc.rect(margin + 36, y, contentWidth - 72, 18);
            doc.setFontSize(7);
            var tituloEncabezado = 'RECEPCIÓN C5 — Packing espejo (Fundo A9)';
            var lineasTitulo = doc.splitTextToSize(tituloEncabezado, contentWidth - 76);
            lineasTitulo.forEach(function (line, i) { doc.text(line, margin + 36 + (contentWidth - 72) / 2, y + 8 + i * 3.5, { align: 'center' }); });
            doc.rect(margin + contentWidth - 36, y, 36, 18);
            var cellMetaRx = margin + contentWidth - 36;
            doc.setFont(undefined, 'normal');
            doc.setFontSize(7);
            doc.text('Código: ' + PDF_CODIGO_PACKING, cellMetaRx + 2, y + 5);
            var now = new Date();
            doc.setFontSize(5.5);
            var genLines = doc.splitTextToSize('Generado: ' + now.toLocaleString('es-CL'), 31);
            var genY0 = y + 8.5;
            genLines.forEach(function (ln, gi) {
                doc.text(ln, cellMetaRx + 2, genY0 + gi * 2.9);
            });
            y += 22;
            var resumenC5Pdf = resumenHoraResponsableC5ParaPdf(fecha, ensayosAEnviar, datosPackingPorEnsayo);
            var rotulo = getView('view_rotulo') || ('Ensayo ' + ensayosAEnviar.join(', Ensayo '));
            var bullet = '\u2022';
            var datosBlockTop = y;
            y += 3;
            doc.setFontSize(8);
            doc.setFont(undefined, 'bold');
            doc.text('Datos del registro', margin + contentWidth / 2, y, { align: 'center' });
            y += 5;
            doc.setFont(undefined, 'normal');
            var camposPDF = [
                { label: 'Tipo', value: 'Recepción C5' },
                { label: 'Fecha registro', value: fecha || '—' },
                { label: 'Hora inicio recep.', value: resumenC5Pdf.horaInicioRecep || '—' },
                { label: 'Responsable', value: resumenC5Pdf.responsableC5 || '—' },
                { label: 'Rótulo / Ensayos', value: rotulo }
            ];
            var rowHDatos = 5.2;
            var colW = contentWidth / 2;
            var leftX = margin + 3;
            var rightX = margin + colW + 3;
            for (var c = 0; c < camposPDF.length; c += 2) {
                var c0 = camposPDF[c];
                var c1 = camposPDF[c + 1];
                doc.text(bullet + ' ' + c0.label + ': ', leftX, y);
                doc.setFont(undefined, 'bold');
                doc.text((c0.value || '—').substring(0, 28), leftX + doc.getTextWidth(bullet + ' ' + c0.label + ': '), y);
                if (c1) {
                    doc.setFont(undefined, 'normal');
                    doc.text(bullet + ' ' + c1.label + ': ', rightX, y);
                    doc.setFont(undefined, 'bold');
                    doc.text((c1.value || '—').substring(0, 28), rightX + doc.getTextWidth(bullet + ' ' + c1.label + ': '), y);
                }
                y += rowHDatos;
            }
            y += 2;
            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.2);
            doc.rect(margin, datosBlockTop - 0.5, contentWidth, y - datosBlockTop + 1, 'S');
            y += 4;
            var lineH = 6;
            var yMax = 272;
            var marginTopNuevaPagina = 12;
            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.4);
            function drawTableC5(titulo, headers, dataRows) {
                var rows = (dataRows || []).slice(0, 15);
                var totalTableH = (1 + rows.length) * lineH;
                if (y + 10 + totalTableH > yMax) { doc.addPage(); y = marginTopNuevaPagina; }
                y += 3;
                doc.setDrawColor(0, 0, 0);
                doc.setLineWidth(0.4);
                doc.setFontSize(fontSize);
                doc.setFont(undefined, 'bold');
                doc.text(titulo, margin, y, { align: 'left' });
                y += 2;
                doc.setFont(undefined, 'normal');
                var nCol = headers.length;
                var tableColW = contentWidth / Math.max(nCol, 1);
                var totalH = (1 + rows.length) * lineH;
                var startY = y;
                doc.rect(margin, startY, contentWidth, totalH);
                for (var ci = 1; ci < nCol; ci++) doc.line(margin + ci * tableColW, startY, margin + ci * tableColW, startY + totalH);
                for (var r = 0; r <= rows.length + 1; r++) doc.line(margin, startY + r * lineH, margin + contentWidth, startY + r * lineH);
                var headerFont = nCol >= 8 ? 5.5 : (nCol > 6 ? 6 : 7);
                doc.setFontSize(headerFont);
                headers.forEach(function (h, i) { doc.text(h, margin + i * tableColW + tableColW / 2, startY + lineH / 2 + 1.2, { align: 'center' }); });
                doc.setFontSize(nCol >= 8 ? 7 : 8);
                y = startY + lineH;
                rows.forEach(function (row) {
                    (row || []).forEach(function (val, i) {
                        if (i < nCol) doc.text(String(val || '').substring(0, 12), margin + i * tableColW + tableColW / 2, y + lineH / 2 + 1.2, { align: 'center' });
                    });
                    y += lineH;
                });
                doc.setFontSize(fontSize);
                y += 1;
            }
            drawTableC5('C5 — 1. Tiempos de la muestra', ['Ensayo', 'N°', 'RECEP.', 'IN. GAS.', 'OUT GAS.', 'IN. PRE.', 'OUT PRE.'], rowsP1);
            drawTableC5('C5 — 2. Pesos', ['Ensayo', 'N°', 'PESO RECEP.', 'PESO IN.GAS', 'PESO OUT.G', 'PESO IN.PR', 'PESO OUT.P'], rowsP2);
            drawTableC5('C5 — 3. Temperatura muestra', ['Ensayo', 'N°', 'T.AMB R', 'T.PUL R', 'T.AMB IN', 'T.PUL IN', 'T.AMB S', 'T.PUL S', 'T.AMB PI', 'T.PUL PI', 'T.AMB PO', 'T.PUL PO'], rowsP3);
            drawTableC5('C5 — 4. Humedad', ['Ensayo', 'N°', 'RECEP.', 'IN. GAS.', 'OUT GAS.', 'IN. PRE.', 'OUT PRE.'], rowsP4);
            drawTableC5('C5 — 5. Presión ambiente', ['Ensayo', 'N°', 'RECEP.', 'IN. GAS.', 'OUT GAS.', 'IN. PRE.', 'OUT PRE.'], rowsP5);
            drawTableC5('C5 — 6. Presión fruta', ['Ensayo', 'N°', 'RECEP.', 'IN. GAS.', 'OUT GAS.', 'IN. PRE.', 'OUT PRE.'], rowsP6);
            drawTableC5('C5 — 7. Observaciones por muestra', ['Ensayo', 'N°', 'OBSERVACIÓN'], rowsP8);
            var nombreArchivo = 'MTTP_RecepcionC5_' + (fecha || 'fecha') + '_Ensayo' + ensayosAEnviar.join('-') + '.pdf';
            return { blobUrl: URL.createObjectURL(doc.output('blob')), nombreArchivo: nombreArchivo };
        } catch (err) {
            console.error(err);
            if (typeof Swal !== 'undefined') Swal.fire({ title: 'Error', text: 'No se pudo generar el PDF Recepción C5.', icon: 'error' });
            return null;
        }
    }

    /** True si algún ensayo a enviar tiene filas de packing en memoria (PDF Packing). */
    function ensayosTienenDatosPackingPdf(ensayos, fecha, datosMap) {
        for (var i = 0; i < ensayos.length; i++) {
            var st = datosMap[keyPacking(fecha, String(ensayos[i]))];
            if (st && getPackingRowCountFromStored(st) > 0) return true;
        }
        return false;
    }
    /** True si algún ensayo a enviar tiene datos Thermo King en memoria. */
    function ensayosTienenDatosThermokingPdf(ensayos, fecha, datosMap) {
        for (var i = 0; i < ensayos.length; i++) {
            var st = datosMap[keyPacking(fecha, String(ensayos[i]))];
            if (st && tieneDatosThermokingParaEnviar(st)) return true;
        }
        return false;
    }
    /** True si algún ensayo a enviar tiene datos Recepción C5 en memoria. */
    function ensayosTienenDatosC5Pdf(ensayos, fecha, datosMap) {
        for (var j = 0; j < ensayos.length; j++) {
            var st = datosMap[keyPacking(fecha, String(ensayos[j]))];
            if (st && tieneDatosC5ParaEnviar(st)) return true;
        }
        return false;
    }

    if (btnGuardarPacking) {
        btnGuardarPacking.addEventListener('click', async () => {
            if (packingBloqueadoParaActual) {
                Swal.fire({
                    title: 'Ya trabajado',
                    text: 'Packing y Recepción C5 ya están guardados en la hoja para este ensayo. Cambia de fecha o ensayo.',
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
            validarFechaInspeccionVsFechaPacking();
            var wsGuardar = getWorkscopeGuardarFlags();
            if (!wsGuardar.guardar_packing && !wsGuardar.guardar_thermoking && !wsGuardar.guardar_c5) {
                Swal.fire({ title: 'Sin módulo', text: currentSidebarView === 'recepcion-c5' ? 'No está disponible Recepción C5 (Fundo A9 y vista C5). Revisa fundo y datos cargados.' : 'Elige un formato de envío (Packing, Thermo King o ambos) y completa fundo y datos de hoja según corresponda.', icon: 'info', confirmButtonColor: '#2f7cc0' });
                return;
            }
            var scopesUiPacking = [];
            if (wsGuardar.guardar_packing) {
                var wpp = document.getElementById('wrapper_packing_panel');
                if (wpp) scopesUiPacking.push({ el: wpp, nombre: 'Packing calibrado' });
            }
            if (wsGuardar.guardar_thermoking) {
                var wtk = document.getElementById('wrapper_thermoking_1');
                if (wtk && wtk.style.display !== 'none' && wtk.getAttribute('aria-hidden') !== 'true') {
                    scopesUiPacking.push({ el: wtk, nombre: 'Thermo King' });
                }
            }
            var wc5 = document.getElementById('wrapper_c5_1');
            if (wc5 && wc5.style.display !== 'none' && wc5.getAttribute('aria-hidden') !== 'true') {
                scopesUiPacking.push({ el: wc5, nombre: 'Recepción C5' });
            }
            if (scopesUiPacking.length) {
                var rUiPack = validarProgresoUiEnContenedores(scopesUiPacking);
                if (!rUiPack.ok) {
                    Swal.fire({ title: 'Secciones incompletas', html: rUiPack.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' });
                    return;
                }
            }
            /* Solo hoja/servidor: packingYaEnviadoPorFecha también se marca por borrador local y rompía el filtro (solo C5). */
            var resEnsayosCache = (cacheEnsayosParaSelect.fecha === fecha && cacheEnsayosParaSelect.res) ? cacheEnsayosParaSelect.res : null;
            var conPackingEnServidor = (resEnsayosCache && resEnsayosCache.ensayosConPacking && typeof resEnsayosCache.ensayosConPacking === 'object')
                ? resEnsayosCache.ensayosConPacking
                : {};
            var ensayosAEnviar = [1, 2, 3, 4].filter(function (e) {
                var key = keyPacking(fecha, e);
                var stored = datosPackingPorEnsayo[key];
                if (!stored) return false;
                var pkServ = !!(conPackingEnServidor[String(e)] || conPackingEnServidor[e]);
                if (pkServ) {
                    if (tieneDatosC5ParaEnviar(stored)) return true;
                    if (wsGuardar.guardar_thermoking && tieneDatosThermokingParaEnviar(stored)) return true;
                    if (wsGuardar.guardar_packing && getPackingRowCountFromStored(stored) > 0) return true;
                    return false;
                }
                if (tieneDatosC5ParaEnviar(stored) && getPackingRowCountFromStored(stored) === 0) {
                    return true;
                }
                var packN = getPackingRowCountFromStored(stored);
                var tkData = tieneDatosThermokingParaEnviar(stored);
                if (wsGuardar.guardar_packing && packN > 0) return true;
                if (wsGuardar.guardar_thermoking && tkData) return true;
                return false;
            });
            if (ensayosAEnviar.length === 0) {
                Swal.fire({ title: 'Sin datos', text: 'No hay nada que enviar con la selección actual: completa datos de Packing y/o Thermo King según el formato elegido, o Recepción C5 si aplica.', icon: 'info' });
                return;
            }
            for (var v = 0; v < ensayosAEnviar.length; v++) {
                var keyV = keyPacking(fecha, String(ensayosAEnviar[v]));
                var stV = datosPackingPorEnsayo[keyV];
                var evStr = String(ensayosAEnviar[v]);
                var pkSrvV = !!(conPackingEnServidor[evStr] || conPackingEnServidor[String(ensayosAEnviar[v])]);
                var soloMergeC5 = !!(pkSrvV && tieneDatosC5ParaEnviar(stV));
                var soloC5SinPackingHoja = !!(!pkSrvV && tieneDatosC5ParaEnviar(stV) && getPackingRowCountFromStored(stV) === 0);
                var omitirValidacionPacking = soloMergeC5 || soloC5SinPackingHoja || !wsGuardar.guardar_packing;
                var omitirValidacionTk = soloMergeC5 || soloC5SinPackingHoja || !wsGuardar.guardar_thermoking;
                var numEsperado = numFilasEsperadoPorFechaEnsayo[keyV];
                if (numEsperado == null) {
                    var cacheEsperado = getPackingCache();
                    var cachedEsperado = (cacheEsperado.datosByFechaEnsayo && cacheEsperado.datosByFechaEnsayo[keyV]) || (cacheEsperado.lastRow && cacheEsperado.lastRow.fecha === fecha && String(cacheEsperado.lastRow.ensayo_numero) === String(ensayosAEnviar[v]) && cacheEsperado.lastRow.data ? cacheEsperado.lastRow.data : null);
                    if (cachedEsperado && cachedEsperado.numFilas != null && cachedEsperado.numFilas > 0) numEsperado = cachedEsperado.numFilas;
                }
                if (!omitirValidacionPacking) {
                    var valid = validarConsistenciaFilasPacking(stV);
                    if (!valid.ok) {
                        Swal.fire({
                            title: 'Inconsistencia de filas',
                            html: 'El <strong>Ensayo ' + ensayosAEnviar[v] + '</strong> no tiene la misma cantidad de filas en Tiempos, Pesos, temperatura, humedad y presiones (Packing 1 a 6).<br><br><strong>Observaciones por muestra</strong> no cuenta en esta comprobación. Las filas deben coincidir antes de enviar.',
                            icon: 'error',
                            confirmButtonColor: '#d33'
                        });
                        return;
                    }
                    var validCompleto = validarPackingCompletoParaGuardar(stV);
                    if (!validCompleto.ok) {
                        Swal.fire({
                            title: 'Campos incompletos',
                            html: 'Al guardar, cada fila debe tener todos los campos llenos.<br><br><strong>' + validCompleto.msg + '</strong>',
                            icon: 'error',
                            confirmButtonColor: '#d33'
                        });
                        return;
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
                if (!omitirValidacionTk && numEsperado != null && numEsperado > 0 && tieneDatosThermokingParaEnviar(stV)) {
                    var validTk = validarConsistenciaFilasThermoking(stV);
                    if (!validTk.ok) {
                        Swal.fire({
                            title: 'Inconsistencia de filas',
                            html: 'En <strong>Thermo King</strong>, todas las secciones deben tener la misma cantidad de filas tomando <strong>Pesos</strong> como base.',
                            icon: 'error',
                            confirmButtonColor: '#d33'
                        });
                        return;
                    }
                    var validTkCompleto = validarThermokingCompletoParaGuardar(stV);
                    if (!validTkCompleto.ok) {
                        Swal.fire({
                            title: 'Campos incompletos',
                            html: 'Thermo King tiene filas incompletas.<br><br><strong>' + validTkCompleto.msg + '</strong>',
                            icon: 'error',
                            confirmButtonColor: '#d33'
                        });
                        return;
                    }
                    var numTk = getThermokingRowCountFromStored(stV);
                    if (numTk !== numEsperado) {
                        Swal.fire({
                            title: 'Cantidad de filas',
                            html: 'En Visual se registró con <strong>' + numEsperado + '</strong> fila(s) para esta fecha y ensayo. Thermo King también debe registrar <strong>' + numEsperado + '</strong> fila(s). Tienes <strong>' + numTk + '</strong> fila(s) para el Ensayo ' + ensayosAEnviar[v] + '.',
                            icon: 'error',
                            confirmButtonColor: '#d33'
                        });
                        return;
                    }
                }
                if (numEsperado != null && numEsperado > 0 && tieneDatosC5ParaEnviar(stV)) {
                    var numC5 = getC5RowCountFromStored(stV);
                    if (numC5 !== numEsperado) {
                        Swal.fire({
                            title: 'Cantidad de filas',
                            html: 'En Visual se registró con <strong>' + numEsperado + '</strong> fila(s) para esta fecha y ensayo. Recepción C5 también debe registrar <strong>' + numEsperado + '</strong> fila(s). Tienes <strong>' + numC5 + '</strong> fila(s) para el Ensayo ' + ensayosAEnviar[v] + '.',
                            icon: 'error',
                            confirmButtonColor: '#d33'
                        });
                        return;
                    }
                }
            }
            var wsPre = getWorkscopeGuardarFlags();
            var totalFilas = 0;
            for (var t = 0; t < ensayosAEnviar.length; t++) {
                var k = keyPacking(fecha, String(ensayosAEnviar[t]));
                var st = datosPackingPorEnsayo[k];
                if (!st) continue;
                var eT = String(ensayosAEnviar[t]);
                var pkSrvT = !!(conPackingEnServidor[eT] || conPackingEnServidor[String(ensayosAEnviar[t])]);
                if (pkSrvT && tieneDatosC5ParaEnviar(st)) {
                    totalFilas += 1;
                } else if (!pkSrvT && tieneDatosC5ParaEnviar(st) && getPackingRowCountFromStored(st) === 0) {
                    totalFilas += 1;
                } else {
                    var nPk = getPackingRowCountFromStored(st);
                    var nTk = (tieneDatosThermokingParaEnviar(st) ? getThermokingRowCountFromStored(st) : 0);
                    var cnt = 0;
                    if (wsPre.guardar_packing && wsPre.guardar_thermoking) {
                        cnt = Math.max(nPk, nTk);
                    } else if (wsPre.guardar_packing) {
                        cnt = nPk;
                    } else if (wsPre.guardar_thermoking) {
                        cnt = nTk;
                    } else if (wsPre.guardar_c5 && tieneDatosC5ParaEnviar(st)) {
                        cnt = getC5RowCountFromStored(st);
                    } else {
                        cnt = nPk;
                    }
                    totalFilas += cnt;
                }
            }
            var esRutaRecepcionC5 = (currentSidebarView === 'recepcion-c5');
            var hayPackingPdf = ensayosTienenDatosPackingPdf(ensayosAEnviar, fecha, datosPackingPorEnsayo);
            var hayTkPdf = ensayosTienenDatosThermokingPdf(ensayosAEnviar, fecha, datosPackingPorEnsayo);
            var hayC5Pdf = ensayosTienenDatosC5Pdf(ensayosAEnviar, fecha, datosPackingPorEnsayo);
            var wsDlg = getWorkscopeGuardarFlags();
            var modoEnvioUi = [];
            if (wsDlg.guardar_packing) modoEnvioUi.push('Packing');
            if (wsDlg.guardar_thermoking) modoEnvioUi.push('Thermo King');
            if (wsDlg.guardar_c5) modoEnvioUi.push('Recepción C5');
            var modoEnvioUiStr = modoEnvioUi.length ? modoEnvioUi.join(' + ') : 'ninguno';
            var pdfConDatos = [];
            if (hayPackingPdf) pdfConDatos.push('Packing');
            if (hayTkPdf) pdfConDatos.push('Thermo King');
            if (hayC5Pdf) pdfConDatos.push('Recepción C5');
            var pdfConDatosStr = pdfConDatos.length ? pdfConDatos.join(', ') : 'ninguno';
            var detalleFilas = (function () {
                var partes = [];
                for (var di = 0; di < ensayosAEnviar.length; di++) {
                    var stD = datosPackingPorEnsayo[keyPacking(fecha, String(ensayosAEnviar[di]))];
                    if (!stD) continue;
                    var nPkD = getPackingRowCountFromStored(stD);
                    var nTkD = tieneDatosThermokingParaEnviar(stD) ? getThermokingRowCountFromStored(stD) : 0;
                    var bits = [];
                    if (wsDlg.guardar_packing && nPkD > 0) bits.push('Pk ' + nPkD);
                    if (wsDlg.guardar_thermoking && nTkD > 0) bits.push('TK ' + nTkD);
                    if (wsDlg.guardar_c5 && tieneDatosC5ParaEnviar(stD)) bits.push('C5 ' + getC5RowCountFromStored(stD));
                    if (bits.length) partes.push('E' + ensayosAEnviar[di] + ': ' + bits.join(' · '));
                }
                return partes.length ? '<p style="margin:8px 0 0 0;font-size:0.9em;color:#334155">' + partes.join('<br>') + '</p>' : '';
            })();
            var htmlEnvioPacking = esRutaRecepcionC5
                ? ('<p><strong>Recepción C5</strong> · Ensayo ' + ensayosAEnviar.join(', ') + ' · <strong>' + totalFilas + '</strong> fila(s) / actualización(es).</p>' +
                    '<p>• <strong>Ver PDF</strong> — solo C5<br>• <strong>Guardar</strong> — envía al servidor<br>• <strong>Cancelar</strong></p>')
                : ('<p><strong>Formato de envío:</strong> ' + modoEnvioUiStr + '</p>' +
                    '<p><strong>Fecha registro:</strong> ' + (fecha || '—') + ' · <strong>Ensayo(s):</strong> ' + ensayosAEnviar.join(', ') + '</p>' +
                    '<p><strong>Muestras / filas a enviar:</strong> <strong>' + totalFilas + '</strong></p>' +
                    detalleFilas +
                    '<p style="margin-top:10px"><strong>PDF con datos:</strong> ' + pdfConDatosStr + '</p>' +
                    '<p style="margin-top:12px;line-height:1.55">• <strong>Ver PDF</strong> — elegir documento<br>• <strong>Guardar</strong> — servidor<br>• <strong>Cancelar</strong></p>');
            var result = await Swal.fire({
                title: esRutaRecepcionC5 ? 'Recepción C5 — ¿Qué deseas hacer?' : '¿Qué deseas hacer?',
                html: htmlEnvioPacking,
                icon: 'question',
                showCancelButton: true,
                showDenyButton: true,
                confirmButtonText: 'Ver PDF',
                denyButtonText: 'Guardar',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#28a745',
                denyButtonColor: '#2f7cc0',
                cancelButtonColor: '#6c757d',
                customClass: { popup: 'swal-packing-envio-dialog' + (esRutaRecepcionC5 ? ' swal-packing-envio-dialog--rc5' : '') },
                width: 'min(96vw, 520px)'
            });
            if (result.isConfirmed) {
                if (esRutaRecepcionC5) {
                    if (!hayC5Pdf) {
                        await Swal.fire({
                            title: 'Sin datos para PDF',
                            text: 'No hay datos de Recepción C5 para generar el PDF.',
                            icon: 'info',
                            confirmButtonColor: '#2f7cc0',
                            customClass: { popup: 'swal-packing-envio-dialog' }
                        });
                        return;
                    }
                    var pdfSoloRc5 = generarPDFRecepcionC5(fecha, ensayosAEnviar, datosPackingPorEnsayo);
                    if (pdfSoloRc5 && pdfSoloRc5.blobUrl) await mostrarVistaPreviaPdf(pdfSoloRc5.blobUrl, pdfSoloRc5.nombreArchivo);
                    return;
                }
                var inputOptions = {};
                if (hayPackingPdf) inputOptions.packing = 'Packing — mediciones de proceso';
                if (hayTkPdf) inputOptions.thermoking = 'Thermo King — mediciones complementarias';
                if (hayC5Pdf) inputOptions.c5 = 'Recepción C5';
                var soloUnPdf = Object.keys(inputOptions).length === 1;
                if (soloUnPdf) {
                    var onlyKey = Object.keys(inputOptions)[0];
                    var pdfSolo = null;
                    if (onlyKey === 'packing') pdfSolo = generarPDFPacking(fecha, ensayosAEnviar, datosPackingPorEnsayo);
                    else if (onlyKey === 'thermoking') pdfSolo = generarPDFThermoKing(fecha, ensayosAEnviar, datosPackingPorEnsayo);
                    else if (onlyKey === 'c5') pdfSolo = generarPDFRecepcionC5(fecha, ensayosAEnviar, datosPackingPorEnsayo);
                    if (pdfSolo && pdfSolo.blobUrl) await mostrarVistaPreviaPdf(pdfSolo.blobUrl, pdfSolo.nombreArchivo);
                    return;
                }
                if (Object.keys(inputOptions).length === 0) {
                    await Swal.fire({
                        title: 'Sin datos para PDF',
                        text: 'No hay datos suficientes para generar ningún PDF (Packing, Thermo King o C5).',
                        icon: 'info',
                        confirmButtonColor: '#2f7cc0'
                    });
                    return;
                }
                var pdfPick = await Swal.fire({
                    title: '¿Qué PDF quieres ver?',
                    html: '<p class="swal-pdf-pick-intro">Solo se listan los PDF que tienen datos.</p>',
                    input: 'select',
                    inputOptions: inputOptions,
                    inputValue: hayPackingPdf ? 'packing' : (hayTkPdf ? 'thermoking' : 'c5'),
                    showCancelButton: true,
                    confirmButtonText: 'Abrir PDF',
                    cancelButtonText: 'Cerrar',
                    confirmButtonColor: '#28a745',
                    cancelButtonColor: '#6c757d',
                    customClass: { popup: 'swal-packing-envio-dialog swal-pdf-pick-popup' },
                    width: 'min(96vw, 440px)'
                });
                if (!pdfPick.isConfirmed || !pdfPick.value) return;
                var pdfResult = null;
                if (pdfPick.value === 'packing') pdfResult = generarPDFPacking(fecha, ensayosAEnviar, datosPackingPorEnsayo);
                else if (pdfPick.value === 'thermoking') pdfResult = generarPDFThermoKing(fecha, ensayosAEnviar, datosPackingPorEnsayo);
                else if (pdfPick.value === 'c5') pdfResult = generarPDFRecepcionC5(fecha, ensayosAEnviar, datosPackingPorEnsayo);
                if (pdfResult && pdfResult.blobUrl) await mostrarVistaPreviaPdf(pdfResult.blobUrl, pdfResult.nombreArchivo);
                return;
            }
            if (!result.isDenied) return;

            var htmlToastPacking = '<div class="registro-toast registro-toast--enviando" role="status"><span class="registro-toast__spinner" aria-hidden="true"></span><div class="registro-toast__msg"><strong>Enviando al servidor</strong><br>' +
                'Fecha <strong>' + (fecha || '—') + '</strong> · Ensayo(s) <strong>' + ensayosAEnviar.join(', ') + '</strong><br>' +
                'Formato de envío: <strong>' + modoEnvioUiStr + '</strong> · muestras / filas: <strong>' + totalFilas + '</strong><br>' +
                'Incluye PDF con datos: <strong>' + pdfConDatosStr + '</strong><br>' +
                (esRutaRecepcionC5 ? 'Ruta: <strong>Recepción C5</strong><br>' : 'Ruta: <strong>Formato packing</strong> (#formato-packing)<br>') +
                '<span class="registro-toast__hint">No cierres la pestaña hasta que termine</span></div></div>';
            Swal.fire({
                toast: true,
                position: 'bottom',
                icon: false,
                showConfirmButton: false,
                showCloseButton: false,
                html: htmlToastPacking,
                customClass: { popup: 'swal-registro-toast swal-registro-toast--info swal-registro-toast--enviando-wide' }
            });
            var avisoDemoraTimerPacking = setTimeout(function () {
                try {
                    var p = document.querySelector('.registro-toast--enviando .registro-toast__msg');
                    if (p) p.innerHTML = '<strong>Sigue enviando…</strong><br><span class="registro-toast__hint">La red puede tardar un poco más</span>';
                } catch (_) {}
            }, 12000);

            packingEnviando = true;
            btnGuardarPacking.disabled = true;
            btnGuardarPacking.setAttribute('aria-busy', 'true');
            var packingText = btnGuardarPacking.querySelector('.btn-guardar-text');
            var spinnerPacking = document.getElementById('spinner_packing');
            if (packingText) packingText.textContent = 'Guardando...';
            if (spinnerPacking) spinnerPacking.style.display = 'inline-block';
            var cache = getPackingCache();
            var enviados = 0;
            var enCola = [];
            try {
                for (var i = 0; i < ensayosAEnviar.length; i++) {
                    var ensayoNumero = String(ensayosAEnviar[i]);
                    var keyFeEn = keyPacking(fecha, ensayoNumero);
                    var dataCached = (cache.datosByFechaEnsayo && cache.datosByFechaEnsayo[keyFeEn]) || (cache.lastRow && cache.lastRow.fecha === fecha && String(cache.lastRow.ensayo_numero) === ensayoNumero && cache.lastRow.data ? cache.lastRow.data : null);
                    var fila = dataCached && dataCached.fila != null ? dataCached.fila : undefined;
                    var stored = datosPackingPorEnsayo[keyFeEn];
                    var packingRows = buildPackingRowsFromStored(stored);
                    var pkSrvPost = !!(conPackingEnServidor[ensayoNumero] || conPackingEnServidor[String(ensayoNumero)]);
                    var soloMergeC5Post = !!(pkSrvPost && tieneDatosC5ParaEnviar(stored));
                    var soloC5SinPackingPost = !!(!pkSrvPost && tieneDatosC5ParaEnviar(stored) && packingRows.length === 0);
                    var wsPost = getWorkscopeGuardarFlags();
                    var soloTkPost = !!(wsPost.guardar_thermoking && tieneDatosThermokingParaEnviar(stored) && !wsPost.guardar_packing && getPackingRowCountFromStored(stored) === 0);
                    if (packingRows.length === 0 && !soloMergeC5Post && !soloC5SinPackingPost && !soloTkPost) continue;
                    var fechaInspeccion = (stored.fecha_inspeccion != null && stored.fecha_inspeccion !== '') ? String(stored.fecha_inspeccion).trim() : '';
                    var responsable = (stored.responsable != null && stored.responsable !== '') ? String(stored.responsable).trim() : '';
                    var horaRecepcion = (stored.hora_recepcion != null && stored.hora_recepcion !== '') ? String(stored.hora_recepcion).trim() : '';
                    var nViaje = (stored.n_viaje != null && stored.n_viaje !== '') ? String(stored.n_viaje).trim() : '';
                    var fechaInspeccionTk = (stored.fecha_inspeccion_thermoking != null && String(stored.fecha_inspeccion_thermoking).trim() !== '') ? String(stored.fecha_inspeccion_thermoking).trim() : fechaInspeccion;
                    var responsableTk = (stored.responsable_thermoking != null && String(stored.responsable_thermoking).trim() !== '') ? String(stored.responsable_thermoking).trim() : responsable;
                    var payload = {
                        fecha: fecha,
                        ensayo_numero: ensayoNumero,
                        fila: fila,
                        fecha_inspeccion: fechaInspeccion,
                        responsable: responsable,
                        hora_recepcion: horaRecepcion,
                        n_viaje: nViaje,
                        fecha_inspeccion_thermoking: fechaInspeccionTk,
                        responsable_thermoking: responsableTk,
                        guardar_packing: wsPost.guardar_packing,
                        guardar_thermoking: wsPost.guardar_thermoking,
                        actualizar_c5: tieneDatosC5ParaEnviar(stored),
                        packingRows: packingRows,
                        // Thermo King (A9): persistir en hoja cuando venga en el store.
                        hora_salida_thermoking: (stored.hora_salida_thermoking != null && stored.hora_salida_thermoking !== '') ? String(stored.hora_salida_thermoking).trim() : '',
                        placa_thermoking: (stored.placa_thermoking != null && stored.placa_thermoking !== '') ? String(stored.placa_thermoking).trim() : '',
                        thermoking_tiempos: Array.isArray(stored.thermoking_tiempos) ? stored.thermoking_tiempos : [],
                        thermoking_peso: Array.isArray(stored.thermoking_peso) ? stored.thermoking_peso : [],
                        thermoking_temp: Array.isArray(stored.thermoking_temp) ? stored.thermoking_temp : [],
                        thermoking_humedad_tk: Array.isArray(stored.thermoking_humedad_tk) ? stored.thermoking_humedad_tk : [],
                        thermoking_presion_tk: Array.isArray(stored.thermoking_presion_tk) ? stored.thermoking_presion_tk : [],
                        thermoking_vapor: Array.isArray(stored.thermoking_vapor) ? stored.thermoking_vapor : [],
                        thermoking_obs: Array.isArray(stored.thermoking_obs) ? stored.thermoking_obs : [],
                        // Recepción C5 (si existe en store del mismo fecha+ensayo).
                        hora_inicio_recepcion_c5: (stored.hora_inicio_recepcion_c5 != null && stored.hora_inicio_recepcion_c5 !== '') ? String(stored.hora_inicio_recepcion_c5).trim() : '',
                        responsable_c5: valorResponsableC5DesdeStored(stored),
                        packing1_c5: Array.isArray(stored.packing1_c5) ? stored.packing1_c5 : [],
                        packing2_c5: Array.isArray(stored.packing2_c5) ? stored.packing2_c5 : [],
                        packing3_c5: Array.isArray(stored.packing3_c5) ? stored.packing3_c5 : [],
                        packing4_c5: Array.isArray(stored.packing4_c5) ? stored.packing4_c5 : [],
                        packing5_c5: Array.isArray(stored.packing5_c5) ? stored.packing5_c5 : [],
                        packing6_c5: Array.isArray(stored.packing6_c5) ? stored.packing6_c5 : [],
                        packing8_c5: Array.isArray(stored.packing8_c5) ? stored.packing8_c5 : []
                    };
                    if (soloC5SinPackingPost) {
                        var payloadC5 = Object.assign({ mode: 'recepcion-c5' }, payload);
                        if (!navigator.onLine) {
                            savePackingToQueue(payloadC5);
                            enCola.push(ensayoNumero);
                        } else try {
                            await postRecepcionC5(payload);
                            enviados++;
                        } catch (err) {
                            savePackingToQueue(payloadC5);
                            enCola.push(ensayoNumero);
                        }
                    } else if (!navigator.onLine) {
                        savePackingToQueue(payload);
                        enCola.push(ensayoNumero);
                    } else try {
                        await postPacking(payload);
                        enviados++;
                    } catch (err) {
                        savePackingToQueue(payload);
                        enCola.push(ensayoNumero);
                    }
                    delete datosPackingPorEnsayo[keyFeEn];
                    var idx = datosPackingPorEnsayoKeysOrder.indexOf(keyFeEn);
                    if (idx !== -1) datosPackingPorEnsayoKeysOrder.splice(idx, 1);
                }
                flushPersistPackingBorradorNow();
                updateUI();
                try { Swal.close(); } catch (_) {}
                try { if (avisoDemoraTimerPacking) clearTimeout(avisoDemoraTimerPacking); } catch (_) {}
                if (enviados > 0 || enCola.length > 0) {
                    limpiarTodoPacking(true);
                    currentEnsayoPacking = '';
                    if (fecha) {
                        currentFechaPacking = fecha;
                        try {
                            var resRefrescoEnsayos = await getEnsayosPorFecha(fecha);
                            renderOpcionesEnsayoPorEstado(fecha, resRefrescoEnsayos);
                        } catch (_) {
                            try { refrescarOpcionesEnsayoDesdeCache(); } catch (_) {}
                        }
                    }
                    if (typeof actualizarBannerRecepcionC5 === 'function') actualizarBannerRecepcionC5();
                    if (typeof actualizarBannerFormatoPacking === 'function') actualizarBannerFormatoPacking();
                    for (var b = 1; b <= 8; b++) {
                        var bodyId = 'body-packing-' + b;
                        var bodyEl = document.getElementById(bodyId);
                        var headerEl = document.querySelector('[data-target="' + bodyId + '"]');
                        var chevronEl = headerEl ? headerEl.querySelector('.chevron') : null;
                        if (bodyEl) bodyEl.style.display = 'none';
                        if (chevronEl) chevronEl.classList.remove('rotate');
                    }
                    if (enCola.length > 0 && enviados === 0) {
                        await Swal.fire({
                            title: 'Guardado en cola',
                            html: 'Sin conexión. Se guardó el packing (Ensayo ' + enCola.join(', Ensayo ') + ').<br><br>Se enviará automáticamente cuando haya internet.',
                            icon: 'info',
                            confirmButtonColor: '#2f7cc0'
                        });
                    } else if (enCola.length > 0 && enviados > 0) {
                        await Swal.fire({
                            title: 'Packing enviado en parte',
                            html: 'Se enviaron <strong>' + enviados + '</strong> ensayo(s).<br><strong>' + enCola.length + '</strong> guardado(s) en cola (sin conexión); se enviarán cuando haya internet.',
                            icon: 'warning',
                            confirmButtonColor: '#2f7cc0'
                        });
                    } else if (enviados > 0) {
                        await Swal.fire({
                            title: 'Packing enviado',
                            html: 'Se enviaron <strong>' + enviados + '</strong> ensayo(s): Ensayo ' + ensayosAEnviar.join(', Ensayo ') + '.<br><br>Se limpió el formulario y se cerraron los bloques.',
                            icon: 'success',
                            confirmButtonColor: '#2f7cc0'
                        });
                    }
                }
            } catch (e) {
                try { if (avisoDemoraTimerPacking) clearTimeout(avisoDemoraTimerPacking); } catch (_) {}
                try { Swal.close(); } catch (_) {}
                Swal.fire({ title: 'Error', text: (e && e.message) || 'No se pudo enviar el packing.', icon: 'error', confirmButtonColor: '#d33' });
            } finally {
                packingEnviando = false;
                btnGuardarPacking.disabled = packingBloqueadoParaActual;
                btnGuardarPacking.removeAttribute('aria-busy');
                if (packingText) {
                    if (currentSidebarView === 'recepcion-c5') {
                        try { actualizarTextoBotonEnviarRecepcionC5(); } catch (_) { packingText.textContent = 'ENVIAR RECEPCIÓN C5'; }
                    } else {
                        packingText.textContent = 'ENVIAR PACKING';
                    }
                }
                if (spinnerPacking) spinnerPacking.style.display = 'none';
            }
        });
    }

    // Eliminar fila: en Pesos (packing2) también quita la misma posición en Tiempos y demás secciones (réplica por índice).
    function eliminarFilaPacking(sectionKey, index) {
        Swal.fire({
            title: '¿Eliminar fila?',
            text: sectionKey === 'packing2'
                ? 'Se eliminará esta fila en Pesos y la fila correspondiente en Tiempos, temperaturas, humedad, presiones y observación.'
                : '¿Estás seguro de que deseas eliminar esta fila?',
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
            if (sectionKey === 'packing2') {
                var vinculados = ['packing1', 'packing3', 'packing4', 'packing5', 'packing6', 'packing8'];
                vinculados.forEach(function (k) {
                    var a = datosPacking[k];
                    if (a && Array.isArray(a) && index < a.length) a.splice(index, 1);
                });
            }
            arr.splice(index, 1);
            renderAllPackingRows();
            actualizarTodosContadoresPacking();
            persistPackingSiThermoking();
        });
    }

    // Replicar solo en ESA sección. Referencia = wrapper_packing_2 (Pesos): no se puede tener más filas que las de Packing 2. Packing 2 no tiene botón Replica (es el padre).
    const SECTION_KEYS_REPLICA = ['packing1', 'packing3', 'packing4', 'packing5', 'packing6', 'packing8'];
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

    function fmtPacking(val, unit) {
        if (val === null || val === undefined || val === '') return '-';
        return val + unit;
    }

    function tkTdFmtPackingCamMp(val, unit) {
        if (thermokingUsarCamaraMP === false) {
            return '<td class="thermoking-tk-cam-mp-cell--disabled"></td>';
        }
        var vv = limpiarLegacyThermokingCamMpValor(val);
        return '<td>' + fmtPacking(vv, unit) + '</td>';
    }
    function agregarFilaPacking2(data, tbody, num) {
        const row = document.createElement('tr');
        row.setAttribute('data-packing-index', num - 1);
        row.innerHTML = `<td class="b-left">${num}</td><td>${fmtPacking(data.peso_recepcion, 'g')}</td><td>${fmtPacking(data.peso_ingreso_gasificado, 'g')}</td><td>${fmtPacking(data.peso_salida_gasificado, 'g')}</td><td>${fmtPacking(data.peso_ingreso_prefrio, 'g')}</td><td>${fmtPacking(data.peso_salida_prefrio, 'g')}</td><td class="b-right"><button type="button" class="btn-edit-row" title="Editar"><i data-lucide="pencil"></i></button><button type="button" class="btn-delete-row" title="Eliminar"><i data-lucide="trash-2"></i></button></td>`;
        tbody.appendChild(row);
        if (window.lucide) lucide.createIcons();
        row.querySelector('.btn-edit-row').addEventListener('click', () => editarFilaPacking2(num - 1, data));
        row.querySelector('.btn-delete-row').addEventListener('click', () => eliminarFilaPacking('packing2', num - 1));
    }

    function agregarFilaPacking3(data, tbody, num) {
        const row = document.createElement('tr');
        row.setAttribute('data-packing-index', num - 1);
        const c = (v) => fmtPacking(v, '°C');
        row.innerHTML = `<td class="b-left">${num}</td><td>${c(data.t_amb_recep)}</td><td>${c(data.t_pulp_recep)}</td><td>${c(data.t_amb_ing)}</td><td>${c(data.t_pulp_ing)}</td><td>${c(data.t_amb_sal)}</td><td>${c(data.t_pulp_sal)}</td><td>${c(data.t_amb_pre_in)}</td><td>${c(data.t_pulp_pre_in)}</td><td>${c(data.t_amb_pre_out)}</td><td>${c(data.t_pulp_pre_out)}</td><td class="b-right"><button type="button" class="btn-edit-row" title="Editar"><i data-lucide="pencil"></i></button><button type="button" class="btn-delete-row" title="Eliminar"><i data-lucide="trash-2"></i></button><button type="button" class="btn-replicate-row" title="Replicar"><i data-lucide="copy"></i></button></td>`;
        tbody.appendChild(row);
        if (window.lucide) lucide.createIcons();
        row.querySelector('.btn-edit-row').addEventListener('click', () => editarFilaPacking3(num - 1, data));
        row.querySelector('.btn-delete-row').addEventListener('click', () => eliminarFilaPacking('packing3', num - 1));
        row.querySelector('.btn-replicate-row').addEventListener('click', () => { replicarHastaPacking2('packing3', num - 1); });
    }

    function agregarFilaThermokingTemp(data, tbody, num) {
        const row = document.createElement('tr');
        row.setAttribute('data-thermoking-temp-index', String(num - 1));
        const c = function (v) { return fmtPacking(v, '°C'); };
        row.innerHTML = '<td class="b-left">' + num + '</td>' + tkTdFmtPackingCamMp(data.ic_cm, '°C') + tkTdFmtPackingCamMp(data.ic_pu, '°C') + tkTdFmtPackingCamMp(data.st_cm, '°C') + tkTdFmtPackingCamMp(data.st_pu, '°C') + '<td>' + c(data.it_amb) + '</td><td>' + c(data.it_veh) + '</td><td>' + c(data.it_pu) + '</td><td>' + c(data.d_amb) + '</td><td>' + c(data.d_veh) + '</td><td>' + c(data.d_pu) + '</td><td class="b-right"><button type="button" class="btn-edit-row" title="Editar"><i data-lucide="pencil"></i></button><button type="button" class="btn-delete-row" title="Eliminar"><i data-lucide="trash-2"></i></button><button type="button" class="btn-replicate-row" title="Replicar"><i data-lucide="copy"></i></button></td>';
        tbody.appendChild(row);
        if (window.lucide) lucide.createIcons();
        var idx = num - 1;
        row.querySelector('.btn-edit-row').addEventListener('click', function () { editarFilaThermokingTemp(idx, datosThermokingTemp[idx]); });
        row.querySelector('.btn-delete-row').addEventListener('click', function () { eliminarFilaThermokingTemp(idx); });
        row.querySelector('.btn-replicate-row').addEventListener('click', function () { replicarThermokingVsPacking2(datosThermokingTemp, idx, emptyThermokingTempRow, renderThermokingTempRows, 'Temperatura Thermo King'); });
    }

    function renderThermokingTempRows() {
        var tbody = document.getElementById('tbody-thermoking-temp');
        if (!tbody) return;
        tbody.innerHTML = '';
        datosThermokingTemp.forEach(function (d, i) { agregarFilaThermokingTemp(d, tbody, i + 1); });
    }

    function editarFilaThermokingTemp(index, dataActual) {
        var d = dataActual || emptyThermokingTempRow();
        var stages = [
            { title: 'Ing. cámara MP', pairs: [
                { id: 'etk1', key: 'ic_cm', label: 'T° cámara MP', icon: 'thermometer-sun' },
                { id: 'etk2', key: 'ic_pu', label: 'T° pulpa', icon: 'cherry' }
            ]},
            { title: 'Salida traslado', pairs: [
                { id: 'etk3', key: 'st_cm', label: 'T° cámara MP', icon: 'thermometer-sun' },
                { id: 'etk4', key: 'st_pu', label: 'T° pulpa', icon: 'cherry' }
            ]},
            { title: 'Inicio traslado T-H', pairs: [
                { id: 'etk5', key: 'it_amb', label: 'T° ambiente', icon: 'thermometer-sun' },
                { id: 'etk6', key: 'it_veh', label: 'T° int. veh.', icon: 'car' },
                { id: 'etk7', key: 'it_pu', label: 'T° pulpa', icon: 'cherry' }
            ]},
            { title: 'Despacho T-H', pairs: [
                { id: 'etk8', key: 'd_amb', label: 'T° ambiente', icon: 'thermometer-sun' },
                { id: 'etk9', key: 'd_veh', label: 'T° int. veh.', icon: 'car' },
                { id: 'etk10', key: 'd_pu', label: 'T° pulpa', icon: 'cherry' }
            ]}
        ];
        var html = '<div class="packing-modal-temp-2cols">';
        stages.forEach(function (st) {
            html += '<div class="temp-stage-row"><div class="temp-stage-name">' + st.title + '</div><div class="temp-stage-fields' + (st.pairs.length === 3 ? ' temp-stage-fields--3' : '') + '">';
            st.pairs.forEach(function (p) {
                var isCam = (p.id === 'etk1' || p.id === 'etk2' || p.id === 'etk3' || p.id === 'etk4');
                if (isCam) {
                    html += '<div class="temp-field temp-field--tk-cam-mp"><label title="' + p.label + '"><i data-lucide="' + p.icon + '" class="temp-icon"></i> ' + p.label + '</label><div class="thermoking-cam-mp-input-row"><input type="number" step="0.1" min="0" id="' + p.id + '" class="swal2-input" value=""><button type="button" class="btn-thermoking-cam-mp-lock-inline" data-tk-lock-for="' + p.id + '" title="Cámara MP" aria-label="Candado cámara materia prima"><i data-lucide="lock"></i></button></div></div>';
                } else {
                    html += '<div class="temp-field"><label title="' + p.label + '"><i data-lucide="' + p.icon + '" class="temp-icon"></i> ' + p.label + '</label><input type="number" step="0.1" min="0" id="' + p.id + '" class="swal2-input" value=""></div>';
                }
            });
            html += '</div></div>';
        });
        html += '</div>';
        var numFila = index + 1;
        Swal.fire({
            title: 'Editar Thermo King — temperaturas (°C) — Fila #' + numFila,
            customClass: { popup: 'packing-edit-modal packing-edit-modal-temp' },
            html: html,
            showCancelButton: true,
            confirmButtonText: 'Guardar',
            cancelButtonText: 'Cancelar',
            didOpen: function () {
                if (window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons();
                stages.forEach(function (st) {
                    st.pairs.forEach(function (p) {
                        var el = document.getElementById(p.id);
                        if (el) {
                            var v = d[p.key];
                            el.value = (v != null && v !== '') ? String(v) : '';
                        }
                    });
                });
                wireThermokingModalCamaraMpInlineLocks(['etk1', 'etk2', 'etk3', 'etk4'], { rowIndex: index });
            },
            preConfirm: function () {
                var v = [];
                for (var i = 1; i <= 10; i++) {
                    var el = document.getElementById('etk' + i);
                    v.push(el ? el.value : '');
                }
                if (thermokingUsarCamaraMP === false) {
                    v[0] = '';
                    v[1] = '';
                    v[2] = '';
                    v[3] = '';
                }
                if (!v.some(function (x) { return String(x || '').trim() !== ''; })) {
                    Swal.showValidationMessage('Debe guardar al menos un dato o pulse Cancelar.');
                    return false;
                }
                var res = validarPackingNumericoOpcional(v);
                if (!res.ok) { Swal.showValidationMessage(res.msg); return false; }
                return { ic_cm: v[0], ic_pu: v[1], st_cm: v[2], st_pu: v[3], it_amb: v[4], it_veh: v[5], it_pu: v[6], d_amb: v[7], d_veh: v[8], d_pu: v[9] };
            }
        }).then(function (r) {
            if (r.isConfirmed && r.value) {
                datosThermokingTemp[index] = r.value;
                renderThermokingTempRows();
                actualizarTodosContadoresPacking();
                persistPackingSiThermoking();
            }
        });
    }

    /** Texto confirmación: Peso TK es tabla cabecera; borrar aquí no debe tocar las demás secciones. */
    var swalEliminarFilaThermokingPesoSoloText = 'Se eliminará solo esta fila en Peso de bruto muestra (Thermo King). No se borran filas en tiempos, temperatura, humedad, presión vapor ni observaciones. No modifica Packing Calibrado.';
    var swalEliminarFilaThermokingSoloEstaTablaText = 'Se eliminará solo esta fila en esta tabla Thermo King. Las demás secciones Thermo King y Packing Calibrado no se modifican.';

    function eliminarFilaThermokingTemp(index) {
        if (index < 0 || index >= datosThermokingTemp.length) return;
        Swal.fire({
            title: '¿Eliminar fila?',
            text: swalEliminarFilaThermokingSoloEstaTablaText,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#d33',
            cancelButtonColor: '#6c757d'
        }).then(function (result) {
            if (!result.isConfirmed) return;
            datosThermokingTemp.splice(index, 1);
            renderAllPackingRows();
            actualizarTodosContadoresPacking();
            persistPackingSiThermoking();
        });
    }

    function agregarFilaPacking4(data, tbody, num) {
        const row = document.createElement('tr');
        row.setAttribute('data-packing-index', num - 1);
        const p = (v) => fmtPacking(v, '%');
        row.innerHTML = `<td class="b-left">${num}</td><td>${p(data.recepcion)}</td><td>${p(data.ingreso_gasificado)}</td><td>${p(data.salida_gasificado)}</td><td>${p(data.ingreso_prefrio)}</td><td>${p(data.salida_prefrio)}</td><td class="b-right"><button type="button" class="btn-edit-row" title="Editar"><i data-lucide="pencil"></i></button><button type="button" class="btn-delete-row" title="Eliminar"><i data-lucide="trash-2"></i></button><button type="button" class="btn-replicate-row" title="Replicar"><i data-lucide="copy"></i></button></td>`;
        tbody.appendChild(row);
        if (window.lucide) lucide.createIcons();
        row.querySelector('.btn-edit-row').addEventListener('click', () => editarFilaPacking4(num - 1, data));
        row.querySelector('.btn-delete-row').addEventListener('click', () => eliminarFilaPacking('packing4', num - 1));
        row.querySelector('.btn-replicate-row').addEventListener('click', () => { replicarHastaPacking2('packing4', num - 1); });
    }

    function agregarFilaPacking5(data, tbody, num) {
        const row = document.createElement('tr');
        row.setAttribute('data-packing-index', num - 1);
        const k = (v) => fmtPacking(v, ' Kpa');
        row.innerHTML = `<td class="b-left">${num}</td><td>${k(data.recepcion)}</td><td>${k(data.ingreso_gasificado)}</td><td>${k(data.salida_gasificado)}</td><td>${k(data.ingreso_prefrio)}</td><td>${k(data.salida_prefrio)}</td><td class="b-right"><button type="button" class="btn-edit-row" title="Editar"><i data-lucide="pencil"></i></button><button type="button" class="btn-delete-row" title="Eliminar"><i data-lucide="trash-2"></i></button><button type="button" class="btn-replicate-row" title="Replicar"><i data-lucide="copy"></i></button></td>`;
        tbody.appendChild(row);
        if (window.lucide) lucide.createIcons();
        row.querySelector('.btn-edit-row').addEventListener('click', () => editarFilaPacking5(num - 1, data));
        row.querySelector('.btn-delete-row').addEventListener('click', () => eliminarFilaPacking('packing5', num - 1));
        row.querySelector('.btn-replicate-row').addEventListener('click', () => { replicarHastaPacking2('packing5', num - 1); });
    }

    function agregarFilaPacking6(data, tbody, num) {
        const row = document.createElement('tr');
        row.setAttribute('data-packing-index', num - 1);
        const k = (v) => fmtPacking(v, ' Kpa');
        row.innerHTML = `<td class="b-left">${num}</td><td>${k(data.recepcion)}</td><td>${k(data.ingreso_gasificado)}</td><td>${k(data.salida_gasificado)}</td><td>${k(data.ingreso_prefrio)}</td><td>${k(data.salida_prefrio)}</td><td class="b-right"><button type="button" class="btn-edit-row" title="Editar"><i data-lucide="pencil"></i></button><button type="button" class="btn-delete-row" title="Eliminar"><i data-lucide="trash-2"></i></button><button type="button" class="btn-replicate-row" title="Replicar"><i data-lucide="copy"></i></button></td>`;
        tbody.appendChild(row);
        if (window.lucide) lucide.createIcons();
        row.querySelector('.btn-edit-row').addEventListener('click', () => editarFilaPacking6(num - 1, data));
        row.querySelector('.btn-delete-row').addEventListener('click', () => eliminarFilaPacking('packing6', num - 1));
        row.querySelector('.btn-replicate-row').addEventListener('click', () => { replicarHastaPacking2('packing6', num - 1); });
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

    function agregarFilaThermokingObs(data, tbody, num) {
        const row = document.createElement('tr');
        row.setAttribute('data-thermoking-obs-index', String(num - 1));
        row.innerHTML = '<td class="b-left">' + num + '</td><td>' + (((data.observacion || '').trim()) || '-') + '</td><td class="b-right"><button type="button" class="btn-edit-row" title="Editar"><i data-lucide="pencil"></i></button><button type="button" class="btn-delete-row" title="Eliminar"><i data-lucide="trash-2"></i></button><button type="button" class="btn-replicate-row" title="Replicar"><i data-lucide="copy"></i></button></td>';
        tbody.appendChild(row);
        if (window.lucide) lucide.createIcons();
        var idx = num - 1;
        row.querySelector('.btn-edit-row').addEventListener('click', function () { editarFilaThermokingObs(idx, datosThermokingObs[idx]); });
        row.querySelector('.btn-delete-row').addEventListener('click', function () { eliminarFilaThermokingObs(idx); });
        row.querySelector('.btn-replicate-row').addEventListener('click', function () { replicarThermokingObs(idx); });
    }

    function renderThermokingObsRows() {
        var tbody = document.getElementById('tbody-thermoking-obs');
        if (!tbody) return;
        tbody.innerHTML = '';
        datosThermokingObs.forEach(function (d, i) { agregarFilaThermokingObs(d, tbody, i + 1); });
    }

    function editarFilaThermokingObs(index, dataActual) {
        var numFila = index + 1;
        Swal.fire({
            title: 'Editar Observación Thermo King — Fila #' + numFila,
            customClass: { popup: 'packing-edit-modal' },
            input: 'text',
            inputValue: (dataActual.observacion || '').toString(),
            showCancelButton: true,
            confirmButtonText: 'Guardar',
            cancelButtonText: 'Cancelar',
            inputValidator: function (value) {
                if (!String(value || '').trim()) return 'Debe escribir al menos un texto o pulse Cancelar.';
            }
        }).then(function (r) {
            if (r.isConfirmed && r.value !== undefined) {
                datosThermokingObs[index] = { observacion: r.value };
                renderThermokingObsRows();
                actualizarTodosContadoresPacking();
                persistPackingSiThermoking();
            }
        });
    }

    function eliminarFilaThermokingObs(index) {
        if (index < 0 || index >= datosThermokingObs.length) return;
        Swal.fire({
            title: '¿Eliminar fila?',
            text: swalEliminarFilaThermokingSoloEstaTablaText,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#d33',
            cancelButtonColor: '#6c757d'
        }).then(function (result) {
            if (!result.isConfirmed) return;
            datosThermokingObs.splice(index, 1);
            renderAllPackingRows();
            actualizarTodosContadoresPacking();
            persistPackingSiThermoking();
        });
    }

    function replicarThermokingObs(rowIndex) {
        const ref = (datosThermokingPesoTk && datosThermokingPesoTk.length) || 0;
        if (ref === 0) {
            Swal.fire({
                title: 'Atención',
                text: 'No hay filas en Peso de bruto muestra (Thermo King). Agrega al menos una fila en Peso para poder replicar.',
                icon: 'warning',
                confirmButtonColor: '#2f7cc0'
            });
            return;
        }
        if (datosThermokingObs.length >= ref) {
            Swal.fire({
                title: 'Límite alcanzado',
                text: 'Ya tienes ' + ref + ' fila(s) de observación, igual que en Peso de bruto muestra (Thermo King).',
                icon: 'info',
                confirmButtonColor: '#2f7cc0'
            });
            return;
        }
        var fuente = (rowIndex >= 0 && datosThermokingObs[rowIndex] != null) ? datosThermokingObs[rowIndex] : (datosThermokingObs.length > 0 ? datosThermokingObs[datosThermokingObs.length - 1] : { observacion: '' });
        datosThermokingObs.push({ observacion: (fuente.observacion != null) ? String(fuente.observacion) : '' });
        renderThermokingObsRows();
        actualizarTodosContadoresPacking();
        persistPackingSiThermoking();
    }

    function agregarFilaThermokingTiempos(data, tbody, num) {
        const row = document.createElement('tr');
        row.setAttribute('data-thermoking-tiempos-index', String(num - 1));
        const t = tkDispTime;
        row.innerHTML = '<td class="b-left">' + num + '</td>' + tkTdTiempoCamMp(data.ic) + tkTdTiempoCamMp(data.st) + '<td>' + t(data.it) + '</td><td>' + t(data.dp) + '</td><td class="b-right"><button type="button" class="btn-edit-row" title="Editar"><i data-lucide="pencil"></i></button><button type="button" class="btn-delete-row" title="Eliminar"><i data-lucide="trash-2"></i></button><button type="button" class="btn-replicate-row" title="Replicar"><i data-lucide="copy"></i></button></td>';
        tbody.appendChild(row);
        if (window.lucide) lucide.createIcons();
        var idx = num - 1;
        row.querySelector('.btn-edit-row').addEventListener('click', function () { editarFilaThermokingTiempos(idx, datosThermokingTiempos[idx]); });
        row.querySelector('.btn-delete-row').addEventListener('click', function () { eliminarFilaThermokingTiempos(idx); });
        row.querySelector('.btn-replicate-row').addEventListener('click', function () { replicarThermokingVsPacking2(datosThermokingTiempos, idx, emptyThermokingTiemposRow, renderThermokingTiemposRows, 'Tiempos Thermo King'); });
    }

    function renderThermokingTiemposRows() {
        var tbody = document.getElementById('tbody-thermoking-tiempos');
        if (!tbody) return;
        tbody.innerHTML = '';
        datosThermokingTiempos.forEach(function (d, i) { agregarFilaThermokingTiempos(d, tbody, i + 1); });
    }

    function editarFilaThermokingTiempos(index, dataActual) {
        var d = dataActual || emptyThermokingTiemposRow();
        var numFila = index + 1;
        Swal.fire({
            title: 'Editar Thermo King — tiempos (hora) — Fila #' + numFila,
            customClass: { popup: 'packing-edit-modal' },
            html: '<div class="packing-modal-grid"><div class="packing-modal-field packing-modal-field--tk-cam-mp"><label>Ing. cámara MP</label><div class="thermoking-cam-mp-input-row"><input type="time" id="etk_tiem_ic" class="swal2-input packing-time-no-clock" /><button type="button" class="btn-thermoking-cam-mp-lock-inline" data-tk-lock-for="etk_tiem_ic" title="Cámara MP" aria-label="Candado cámara materia prima"><i data-lucide="lock"></i></button></div></div><div class="packing-modal-field packing-modal-field--tk-cam-mp"><label>Sal. cám. MP</label><div class="thermoking-cam-mp-input-row"><input type="time" id="etk_tiem_st" class="swal2-input packing-time-no-clock" /><button type="button" class="btn-thermoking-cam-mp-lock-inline" data-tk-lock-for="etk_tiem_st" title="Cámara MP" aria-label="Candado cámara materia prima"><i data-lucide="lock"></i></button></div></div><div class="packing-modal-field"><label>Inic. trasl. T-H</label><input type="time" id="etk_tiem_it" class="swal2-input packing-time-no-clock" /></div><div class="packing-modal-field"><label>Despacho T-H</label><input type="time" id="etk_tiem_dp" class="swal2-input packing-time-no-clock" /></div></div>',
            showCancelButton: true,
            confirmButtonText: 'Guardar',
            cancelButtonText: 'Cancelar',
            didOpen: function () {
                var a = document.getElementById('etk_tiem_ic'); if (a) a.value = (d.ic || '').trim();
                var b = document.getElementById('etk_tiem_st'); if (b) b.value = (d.st || '').trim();
                var c = document.getElementById('etk_tiem_it'); if (c) c.value = (d.it || '').trim();
                var e = document.getElementById('etk_tiem_dp'); if (e) e.value = (d.dp || '').trim();
                wireThermokingModalCamaraMpInlineLocks(['etk_tiem_ic', 'etk_tiem_st'], { rowIndex: index });
            },
            preConfirm: function () {
                var vals = [
                    (document.getElementById('etk_tiem_ic') && document.getElementById('etk_tiem_ic').value) || '',
                    (document.getElementById('etk_tiem_st') && document.getElementById('etk_tiem_st').value) || '',
                    (document.getElementById('etk_tiem_it') && document.getElementById('etk_tiem_it').value) || '',
                    (document.getElementById('etk_tiem_dp') && document.getElementById('etk_tiem_dp').value) || ''
                ];
                if (thermokingUsarCamaraMP === false) {
                    vals[0] = '';
                    vals[1] = '';
                }
                if (!vals.some(function (x) { return String(x || '').trim() !== ''; })) {
                    Swal.showValidationMessage('Debe guardar al menos un dato o pulse Cancelar.');
                    return false;
                }
                var cad = validarThermokingTiempoCadenaCreciente(vals);
                if (!cad.ok) { Swal.showValidationMessage(cad.msg); return false; }
                return { ic: vals[0], st: vals[1], it: vals[2], dp: vals[3] };
            }
        }).then(function (r) {
            if (r.isConfirmed && r.value) {
                datosThermokingTiempos[index] = r.value;
                renderThermokingTiemposRows();
                actualizarTodosContadoresPacking();
                persistPackingSiThermoking();
            }
        });
    }

    function eliminarFilaThermokingTiempos(index) {
        if (index < 0 || index >= datosThermokingTiempos.length) return;
        Swal.fire({
            title: '¿Eliminar fila?',
            text: swalEliminarFilaThermokingSoloEstaTablaText,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#d33',
            cancelButtonColor: '#6c757d'
        }).then(function (result) {
            if (!result.isConfirmed) return;
            datosThermokingTiempos.splice(index, 1);
            renderAllPackingRows();
            actualizarTodosContadoresPacking();
            persistPackingSiThermoking();
        });
    }

    function agregarFilaThermokingPesoTk(data, tbody, num) {
        const row = document.createElement('tr');
        row.setAttribute('data-thermoking-peso-index', String(num - 1));
        const p = function (v) { return fmtPacking(v, 'g'); };
        row.innerHTML = '<td class="b-left">' + num + '</td>' + tkTdFmtPackingCamMp(data.ic, 'g') + tkTdFmtPackingCamMp(data.st, 'g') + '<td>' + p(data.it) + '</td><td>' + p(data.dp) + '</td><td class="b-right"><button type="button" class="btn-edit-row" title="Editar"><i data-lucide="pencil"></i></button><button type="button" class="btn-delete-row" title="Eliminar"><i data-lucide="trash-2"></i></button></td>';
        tbody.appendChild(row);
        if (window.lucide) lucide.createIcons();
        var idx = num - 1;
        row.querySelector('.btn-edit-row').addEventListener('click', function () { editarFilaThermokingPesoTk(idx, datosThermokingPesoTk[idx]); });
        row.querySelector('.btn-delete-row').addEventListener('click', function () { eliminarFilaThermokingPesoTk(idx); });
    }

    function renderThermokingPesoTkRows() {
        var tbody = document.getElementById('tbody-thermoking-peso');
        if (!tbody) return;
        tbody.innerHTML = '';
        datosThermokingPesoTk.forEach(function (d, i) { agregarFilaThermokingPesoTk(d, tbody, i + 1); });
    }

    function editarFilaThermokingPesoTk(index, dataActual) {
        var d = dataActual || emptyThermokingPesoTkRow();
        var numFila = index + 1;
        Swal.fire({
            title: 'Editar Thermo King — peso (g) — Fila #' + numFila,
            customClass: { popup: 'packing-edit-modal' },
            html: '<div class="packing-modal-grid"><div class="packing-modal-field packing-modal-field--tk-cam-mp"><label>Ing. cámara MP</label><div class="thermoking-cam-mp-input-row"><input type="number" step="0.1" min="0" id="etk_pe_ic" class="swal2-input" /><button type="button" class="btn-thermoking-cam-mp-lock-inline" data-tk-lock-for="etk_pe_ic" title="Cámara MP" aria-label="Candado cámara materia prima"><i data-lucide="lock"></i></button></div></div><div class="packing-modal-field packing-modal-field--tk-cam-mp"><label>Sal. cám. MP</label><div class="thermoking-cam-mp-input-row"><input type="number" step="0.1" min="0" id="etk_pe_st" class="swal2-input" /><button type="button" class="btn-thermoking-cam-mp-lock-inline" data-tk-lock-for="etk_pe_st" title="Cámara MP" aria-label="Candado cámara materia prima"><i data-lucide="lock"></i></button></div></div><div class="packing-modal-field"><label>Inic. trasl. T-H</label><input type="number" step="0.1" min="0" id="etk_pe_it" class="swal2-input" /></div><div class="packing-modal-field"><label>Despacho T-H</label><input type="number" step="0.1" min="0" id="etk_pe_dp" class="swal2-input" /></div></div><p id="etk_pe_live_err" class="tk-peso-validacion-msg" role="alert" style="display:none;"></p>',
            showCancelButton: true,
            confirmButtonText: 'Guardar',
            cancelButtonText: 'Cancelar',
            didOpen: function () {
                ['etk_pe_ic', 'etk_pe_st', 'etk_pe_it', 'etk_pe_dp'].forEach(function (id, i) {
                    var el = document.getElementById(id);
                    var keys = ['ic', 'st', 'it', 'dp'];
                    if (el) el.value = (d[keys[i]] != null && d[keys[i]] !== '') ? String(d[keys[i]]) : '';
                });
                function liveModalTkPeso() {
                    var vals = ['etk_pe_ic', 'etk_pe_st', 'etk_pe_it', 'etk_pe_dp'].map(function (id) {
                        var el = document.getElementById(id);
                        return el ? el.value : '';
                    });
                    var res = validarThermokingPesoCadenaCreciente(vals, index);
                    var errEl = document.getElementById('etk_pe_live_err');
                    ['etk_pe_ic', 'etk_pe_st', 'etk_pe_it', 'etk_pe_dp'].forEach(function (id) {
                        var el = document.getElementById(id);
                        if (el) el.classList.toggle('input-invalid-tk', !res.ok);
                    });
                    if (errEl) {
                        errEl.textContent = res.ok ? '' : res.msg;
                        errEl.style.display = res.ok ? 'none' : 'block';
                    }
                }
                ['etk_pe_ic', 'etk_pe_st', 'etk_pe_it', 'etk_pe_dp'].forEach(function (id) {
                    var el = document.getElementById(id);
                    if (el) {
                        el.addEventListener('input', liveModalTkPeso);
                        el.addEventListener('change', liveModalTkPeso);
                    }
                });
                wireThermokingModalCamaraMpInlineLocks(['etk_pe_ic', 'etk_pe_st'], { onAfterRefresh: liveModalTkPeso, rowIndex: index });
                liveModalTkPeso();
            },
            preConfirm: function () {
                var vals = ['etk_pe_ic', 'etk_pe_st', 'etk_pe_it', 'etk_pe_dp'].map(function (id) { var el = document.getElementById(id); return el ? el.value : ''; });
                if (thermokingUsarCamaraMP === false) {
                    vals[0] = '';
                    vals[1] = '';
                }
                if (!vals.some(function (x) { return String(x || '').trim() !== ''; })) {
                    Swal.showValidationMessage('Debe guardar al menos un dato o pulse Cancelar.');
                    return false;
                }
                var res = validarPackingNumericoOpcional(vals);
                if (!res.ok) { Swal.showValidationMessage(res.msg); return false; }
                var cad = validarThermokingPesoCadenaCreciente(vals, index);
                if (!cad.ok) { Swal.showValidationMessage(cad.msg); return false; }
                return { ic: vals[0], st: vals[1], it: vals[2], dp: vals[3] };
            }
        }).then(function (r) {
            if (r.isConfirmed && r.value) {
                datosThermokingPesoTk[index] = r.value;
                renderThermokingPesoTkRows();
                actualizarTodosContadoresPacking();
                persistPackingSiThermoking();
            }
        });
    }

    function eliminarFilaThermokingPesoTk(index) {
        if (index < 0 || index >= datosThermokingPesoTk.length) return;
        Swal.fire({
            title: '¿Eliminar fila?',
            text: swalEliminarFilaThermokingPesoSoloText,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#d33',
            cancelButtonColor: '#6c757d'
        }).then(function (result) {
            if (!result.isConfirmed) return;
            datosThermokingPesoTk.splice(index, 1);
            renderAllPackingRows();
            actualizarTodosContadoresPacking();
            persistPackingSiThermoking();
        });
    }

    function agregarFilaThermokingHumedadTk(data, tbody, num) {
        const row = document.createElement('tr');
        row.setAttribute('data-thermoking-humedad-index', String(num - 1));
        const p = function (v) { return fmtPacking(v, '%'); };
        row.innerHTML = '<td class="b-left">' + num + '</td>' + tkTdFmtPackingCamMp(data.ic, '%') + tkTdFmtPackingCamMp(data.st, '%') + '<td>' + p(data.aei) + '</td><td>' + p(data.ivi) + '</td><td>' + p(data.aed) + '</td><td>' + p(data.ivd) + '</td><td class="b-right"><button type="button" class="btn-edit-row" title="Editar"><i data-lucide="pencil"></i></button><button type="button" class="btn-delete-row" title="Eliminar"><i data-lucide="trash-2"></i></button><button type="button" class="btn-replicate-row" title="Replicar"><i data-lucide="copy"></i></button></td>';
        tbody.appendChild(row);
        if (window.lucide) lucide.createIcons();
        var idx = num - 1;
        row.querySelector('.btn-edit-row').addEventListener('click', function () { editarFilaThermokingHumedadTk(idx, datosThermokingHumedadTk[idx]); });
        row.querySelector('.btn-delete-row').addEventListener('click', function () { eliminarFilaThermokingHumedadTk(idx); });
        row.querySelector('.btn-replicate-row').addEventListener('click', function () { replicarThermokingVsPacking2(datosThermokingHumedadTk, idx, emptyThermokingHumedadTkRow, renderThermokingHumedadTkRows, 'Humedad Thermo King'); });
    }

    function renderThermokingHumedadTkRows() {
        var tbody = document.getElementById('tbody-thermoking-humedad');
        if (!tbody) return;
        tbody.innerHTML = '';
        datosThermokingHumedadTk.forEach(function (d, i) { agregarFilaThermokingHumedadTk(d, tbody, i + 1); });
    }

    function editarFilaThermokingHumedadTk(index, dataActual) {
        var d = dataActual || emptyThermokingHumedadTkRow();
        var numFila = index + 1;
        var ids = ['etk_hu_ic', 'etk_hu_st', 'etk_hu_aei', 'etk_hu_ivi', 'etk_hu_aed', 'etk_hu_ivd'];
        var labels = ['Ing. cámara MP', 'Sal. cám. MP', 'Amb. ext. inic.', 'Int. veh. inic.', 'Amb. ext. desp.', 'Int. veh. desp.'];
        var html = '<div class="packing-modal-grid">';
        for (var z = 0; z < 6; z++) {
            if (z < 2) {
                html += '<div class="packing-modal-field packing-modal-field--tk-cam-mp"><label>' + labels[z] + '</label><div class="thermoking-cam-mp-input-row"><input type="number" step="0.1" min="0" id="' + ids[z] + '" class="swal2-input" /><button type="button" class="btn-thermoking-cam-mp-lock-inline" data-tk-lock-for="' + ids[z] + '" title="Cámara MP" aria-label="Candado cámara materia prima"><i data-lucide="lock"></i></button></div></div>';
            } else {
                html += '<div class="packing-modal-field"><label>' + labels[z] + '</label><input type="number" step="0.1" min="0" id="' + ids[z] + '" class="swal2-input" /></div>';
            }
        }
        html += '</div>';
        Swal.fire({
            title: 'Editar Thermo King — humedad (%) — Fila #' + numFila,
            customClass: { popup: 'packing-edit-modal' },
            html: html,
            showCancelButton: true,
            confirmButtonText: 'Guardar',
            cancelButtonText: 'Cancelar',
            didOpen: function () {
                var keys = ['ic', 'st', 'aei', 'ivi', 'aed', 'ivd'];
                ids.forEach(function (id, i) {
                    var el = document.getElementById(id);
                    if (el) el.value = (d[keys[i]] != null && d[keys[i]] !== '') ? String(d[keys[i]]) : '';
                });
                wireThermokingModalCamaraMpInlineLocks(['etk_hu_ic', 'etk_hu_st'], { rowIndex: index });
            },
            preConfirm: function () {
                var vals = ids.map(function (id) { var el = document.getElementById(id); return el ? el.value : ''; });
                if (thermokingUsarCamaraMP === false) {
                    vals[0] = '';
                    vals[1] = '';
                }
                if (!vals.some(function (x) { return String(x || '').trim() !== ''; })) {
                    Swal.showValidationMessage('Debe guardar al menos un dato o pulse Cancelar.');
                    return false;
                }
                var res = validarPackingNumericoOpcional(vals);
                if (!res.ok) { Swal.showValidationMessage(res.msg); return false; }
                return { ic: vals[0], st: vals[1], aei: vals[2], ivi: vals[3], aed: vals[4], ivd: vals[5] };
            }
        }).then(function (r) {
            if (r.isConfirmed && r.value) {
                datosThermokingHumedadTk[index] = r.value;
                renderThermokingHumedadTkRows();
                actualizarTodosContadoresPacking();
                persistPackingSiThermoking();
            }
        });
    }

    function eliminarFilaThermokingHumedadTk(index) {
        if (index < 0 || index >= datosThermokingHumedadTk.length) return;
        Swal.fire({
            title: '¿Eliminar fila?',
            text: swalEliminarFilaThermokingSoloEstaTablaText,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#d33',
            cancelButtonColor: '#6c757d'
        }).then(function (result) {
            if (!result.isConfirmed) return;
            datosThermokingHumedadTk.splice(index, 1);
            renderAllPackingRows();
            actualizarTodosContadoresPacking();
            persistPackingSiThermoking();
        });
    }

    function agregarFilaThermokingPresionTk(data, tbody, num) {
        const row = document.createElement('tr');
        row.setAttribute('data-thermoking-presion-index', String(num - 1));
        const k = function (v) { return fmtPacking(v, ' Kpa'); };
        row.innerHTML = '<td class="b-left">' + num + '</td>' + tkTdFmtPackingCamMp(data.ic, ' Kpa') + tkTdFmtPackingCamMp(data.st, ' Kpa') + '<td>' + k(data.aei) + '</td><td>' + k(data.ivi) + '</td><td>' + k(data.aed) + '</td><td>' + k(data.ivd) + '</td><td class="b-right"><button type="button" class="btn-edit-row" title="Editar"><i data-lucide="pencil"></i></button><button type="button" class="btn-delete-row" title="Eliminar"><i data-lucide="trash-2"></i></button><button type="button" class="btn-replicate-row" title="Replicar"><i data-lucide="copy"></i></button></td>';
        tbody.appendChild(row);
        if (window.lucide) lucide.createIcons();
        var idx = num - 1;
        row.querySelector('.btn-edit-row').addEventListener('click', function () { editarFilaThermokingPresionTk(idx, datosThermokingPresionTk[idx]); });
        row.querySelector('.btn-delete-row').addEventListener('click', function () { eliminarFilaThermokingPresionTk(idx); });
        row.querySelector('.btn-replicate-row').addEventListener('click', function () { replicarThermokingVsPacking2(datosThermokingPresionTk, idx, emptyThermokingPresionTkRow, renderThermokingPresionTkRows, 'Presión vapor amb. Thermo King'); });
    }

    function renderThermokingPresionTkRows() {
        var tbody = document.getElementById('tbody-thermoking-presion');
        if (!tbody) return;
        tbody.innerHTML = '';
        datosThermokingPresionTk.forEach(function (d, i) { agregarFilaThermokingPresionTk(d, tbody, i + 1); });
    }

    function editarFilaThermokingPresionTk(index, dataActual) {
        var d = dataActual || emptyThermokingPresionTkRow();
        var numFila = index + 1;
        var ids = ['etk_pr_ic', 'etk_pr_st', 'etk_pr_aei', 'etk_pr_ivi', 'etk_pr_aed', 'etk_pr_ivd'];
        var labels = ['Ing. cámara MP', 'Sal. cám. MP', 'Amb. ext. inic.', 'Int. veh. inic.', 'Amb. ext. desp.', 'Int. veh. desp.'];
        var html = '<div class="packing-modal-grid">';
        for (var z = 0; z < 6; z++) {
            if (z < 2) {
                html += '<div class="packing-modal-field packing-modal-field--tk-cam-mp"><label>' + labels[z] + '</label><div class="thermoking-cam-mp-input-row"><input type="number" step="0.001" min="0" id="' + ids[z] + '" class="swal2-input" /><button type="button" class="btn-thermoking-cam-mp-lock-inline" data-tk-lock-for="' + ids[z] + '" title="Cámara MP" aria-label="Candado cámara materia prima"><i data-lucide="lock"></i></button></div></div>';
            } else {
                html += '<div class="packing-modal-field"><label>' + labels[z] + '</label><input type="number" step="0.001" min="0" id="' + ids[z] + '" class="swal2-input" /></div>';
            }
        }
        html += '</div>';
        Swal.fire({
            title: 'Editar Thermo King — presión vapor amb. (Kpa) — Fila #' + numFila,
            customClass: { popup: 'packing-edit-modal' },
            html: html,
            showCancelButton: true,
            confirmButtonText: 'Guardar',
            cancelButtonText: 'Cancelar',
            didOpen: function () {
                var keys = ['ic', 'st', 'aei', 'ivi', 'aed', 'ivd'];
                ids.forEach(function (id, i) {
                    var el = document.getElementById(id);
                    if (el) el.value = (d[keys[i]] != null && d[keys[i]] !== '') ? String(d[keys[i]]) : '';
                });
                wireThermokingModalCamaraMpInlineLocks(['etk_pr_ic', 'etk_pr_st'], { rowIndex: index });
            },
            preConfirm: function () {
                var vals = ids.map(function (id) { var el = document.getElementById(id); return el ? el.value : ''; });
                if (thermokingUsarCamaraMP === false) {
                    vals[0] = '';
                    vals[1] = '';
                }
                if (!vals.some(function (x) { return String(x || '').trim() !== ''; })) {
                    Swal.showValidationMessage('Debe guardar al menos un dato o pulse Cancelar.');
                    return false;
                }
                var res = validarPackingNumericoOpcional(vals);
                if (!res.ok) { Swal.showValidationMessage(res.msg); return false; }
                return { ic: vals[0], st: vals[1], aei: vals[2], ivi: vals[3], aed: vals[4], ivd: vals[5] };
            }
        }).then(function (r) {
            if (r.isConfirmed && r.value) {
                datosThermokingPresionTk[index] = r.value;
                renderThermokingPresionTkRows();
                actualizarTodosContadoresPacking();
                persistPackingSiThermoking();
            }
        });
    }

    function eliminarFilaThermokingPresionTk(index) {
        if (index < 0 || index >= datosThermokingPresionTk.length) return;
        Swal.fire({
            title: '¿Eliminar fila?',
            text: swalEliminarFilaThermokingSoloEstaTablaText,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#d33',
            cancelButtonColor: '#6c757d'
        }).then(function (result) {
            if (!result.isConfirmed) return;
            datosThermokingPresionTk.splice(index, 1);
            renderAllPackingRows();
            actualizarTodosContadoresPacking();
            persistPackingSiThermoking();
        });
    }

    function agregarFilaThermokingVapor(data, tbody, num) {
        const row = document.createElement('tr');
        row.setAttribute('data-thermoking-vapor-index', String(num - 1));
        const k = function (v) { return fmtPacking(v, ' Kpa'); };
        row.innerHTML = '<td class="b-left">' + num + '</td>' + tkTdFmtPackingCamMp(data.ic, ' Kpa') + tkTdFmtPackingCamMp(data.scm, ' Kpa') + '<td>' + k(data.it) + '</td><td>' + k(data.st) + '</td><td class="b-right"><button type="button" class="btn-edit-row" title="Editar"><i data-lucide="pencil"></i></button><button type="button" class="btn-delete-row" title="Eliminar"><i data-lucide="trash-2"></i></button><button type="button" class="btn-replicate-row" title="Replicar"><i data-lucide="copy"></i></button></td>';
        tbody.appendChild(row);
        if (window.lucide) lucide.createIcons();
        var idx = num - 1;
        row.querySelector('.btn-edit-row').addEventListener('click', function () { editarFilaThermokingVapor(idx, datosThermokingVapor[idx]); });
        row.querySelector('.btn-delete-row').addEventListener('click', function () { eliminarFilaThermokingVapor(idx); });
        row.querySelector('.btn-replicate-row').addEventListener('click', function () { replicarThermokingVsPacking2(datosThermokingVapor, idx, emptyThermokingVaporRow, renderThermokingVaporRows, 'Presión vapor fruta Thermo King'); });
    }

    function renderThermokingVaporRows() {
        var tbody = document.getElementById('tbody-thermoking-vapor');
        if (!tbody) return;
        tbody.innerHTML = '';
        datosThermokingVapor.forEach(function (d, i) { agregarFilaThermokingVapor(d, tbody, i + 1); });
    }

    function editarFilaThermokingVapor(index, dataActual) {
        var d = dataActual || emptyThermokingVaporRow();
        var numFila = index + 1;
        Swal.fire({
            title: 'Editar Thermo King — presión vapor fruta (Kpa) — Fila #' + numFila,
            customClass: { popup: 'packing-edit-modal' },
            html: '<div class="packing-modal-grid"><div class="packing-modal-field packing-modal-field--tk-cam-mp"><label>Ing. cámara MP</label><div class="thermoking-cam-mp-input-row"><input type="number" step="0.001" min="0" id="etk_va_ic" class="swal2-input" /><button type="button" class="btn-thermoking-cam-mp-lock-inline" data-tk-lock-for="etk_va_ic" title="Cámara MP" aria-label="Candado cámara materia prima"><i data-lucide="lock"></i></button></div></div><div class="packing-modal-field packing-modal-field--tk-cam-mp"><label>Sal. cám. MP</label><div class="thermoking-cam-mp-input-row"><input type="number" step="0.001" min="0" id="etk_va_scm" class="swal2-input" /><button type="button" class="btn-thermoking-cam-mp-lock-inline" data-tk-lock-for="etk_va_scm" title="Cámara MP" aria-label="Candado cámara materia prima"><i data-lucide="lock"></i></button></div></div><div class="packing-modal-field"><label>Inic. trasl. T-H</label><input type="number" step="0.001" min="0" id="etk_va_it" class="swal2-input" /></div><div class="packing-modal-field"><label>Sal. trasl. T-H</label><input type="number" step="0.001" min="0" id="etk_va_st" class="swal2-input" /></div></div>',
            showCancelButton: true,
            confirmButtonText: 'Guardar',
            cancelButtonText: 'Cancelar',
            didOpen: function () {
                var a = document.getElementById('etk_va_ic'); if (a) a.value = (d.ic != null && d.ic !== '') ? String(d.ic) : '';
                var s = document.getElementById('etk_va_scm'); if (s) s.value = (d.scm != null && d.scm !== '') ? String(d.scm) : '';
                var b = document.getElementById('etk_va_it'); if (b) b.value = (d.it != null && d.it !== '') ? String(d.it) : '';
                var c = document.getElementById('etk_va_st'); if (c) c.value = (d.st != null && d.st !== '') ? String(d.st) : '';
                wireThermokingModalCamaraMpInlineLocks(['etk_va_ic', 'etk_va_scm'], { rowIndex: index });
            },
            preConfirm: function () {
                var vals = ['etk_va_ic', 'etk_va_scm', 'etk_va_it', 'etk_va_st'].map(function (id) { var el = document.getElementById(id); return el ? el.value : ''; });
                if (thermokingUsarCamaraMP === false) {
                    vals[0] = '';
                    vals[1] = '';
                }
                if (!vals.some(function (x) { return String(x || '').trim() !== ''; })) {
                    Swal.showValidationMessage('Debe guardar al menos un dato o pulse Cancelar.');
                    return false;
                }
                var res = validarPackingNumericoOpcional(vals);
                if (!res.ok) { Swal.showValidationMessage(res.msg); return false; }
                return { ic: vals[0], scm: vals[1], it: vals[2], st: vals[3] };
            }
        }).then(function (r) {
            if (r.isConfirmed && r.value) {
                datosThermokingVapor[index] = r.value;
                renderThermokingVaporRows();
                actualizarTodosContadoresPacking();
                persistPackingSiThermoking();
            }
        });
    }

    function eliminarFilaThermokingVapor(index) {
        if (index < 0 || index >= datosThermokingVapor.length) return;
        Swal.fire({
            title: '¿Eliminar fila?',
            text: swalEliminarFilaThermokingSoloEstaTablaText,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#d33',
            cancelButtonColor: '#6c757d'
        }).then(function (result) {
            if (!result.isConfirmed) return;
            datosThermokingVapor.splice(index, 1);
            renderAllPackingRows();
            actualizarTodosContadoresPacking();
            persistPackingSiThermoking();
        });
    }

    function requierePrimeraFilaPesoC5() {
        if (datosC5.packing2_c5 && datosC5.packing2_c5.length > 0) return { ok: true };
        var vals = REG_C5_PESO_IDS.map(function (id) {
            var el = document.getElementById(id);
            return el ? String(el.value || '').trim() : '';
        });
        if (vals.some(function (v) { return v !== ''; })) return { ok: true };
        return { ok: false, msg: 'Primero complete al menos una fila en «Peso bruto muestra» (C5) (valores en la primera fila). Después podrá usar Tiempos, temperatura, humedad, etc.' };
    }

    function replicarC5VsPeso(arr, rowIndex, emptyRow, renderFn, nombreCorto) {
        const ref = (datosC5.packing2_c5 && datosC5.packing2_c5.length) || 0;
        if (ref === 0) {
            Swal.fire({ title: 'Atención', text: 'No hay filas en Peso bruto muestra (C5). Agrega al menos una fila en Pesos para poder replicar.', icon: 'warning', confirmButtonColor: '#2f7cc0' });
            return;
        }
        if (arr.length >= ref) {
            Swal.fire({ title: 'Límite alcanzado', text: 'Ya tienes ' + ref + ' fila(s) en ' + nombreCorto + ', igual que en Peso bruto muestra (C5).', icon: 'info', confirmButtonColor: '#2f7cc0' });
            return;
        }
        var fuente = (rowIndex >= 0 && arr[rowIndex] != null) ? arr[rowIndex] : (arr.length > 0 ? arr[arr.length - 1] : emptyRow());
        arr.push(JSON.parse(JSON.stringify(fuente)));
        renderFn();
        actualizarTodosContadoresPacking();
        persistPackingSiThermoking();
    }

    function canAgregarFilaC5(sectionKey) {
        const arr = datosC5[sectionKey];
        if (!arr) return true;
        if (sectionKey === 'packing1_c5') {
            if (datosC5.packing2_c5.length === 0) {
                Swal.fire({ title: 'Primero: Peso C5', text: 'Agrega al menos una fila en «Peso bruto muestra» (C5) antes de registrar filas en Tiempos C5.', icon: 'warning', confirmButtonColor: '#2f7cc0' });
                return false;
            }
            const limite = datosC5.packing2_c5.length;
            if (arr.length >= limite) {
                Swal.fire({ title: 'Límite alcanzado', text: 'Ya tienes ' + limite + ' registro(s) en Tiempos C5 (máximo según filas en Pesos C5).', icon: 'info', confirmButtonColor: '#2f7cc0' });
                return false;
            }
            return true;
        }
        if (sectionKey === 'packing2_c5') {
            if (arr.length >= maxFilasPacking) {
                Swal.fire({ title: 'Límite alcanzado', text: 'Ya tienes ' + maxFilasPacking + ' registros (máximo según N° Clamshells).', icon: 'info', confirmButtonColor: '#2f7cc0' });
                return false;
            }
            return true;
        }
        const hayBase = datosC5.packing2_c5.length > 0;
        if (!hayBase) {
            Swal.fire({ title: 'Primero: Peso C5', text: 'Agrega al menos una fila en «Peso bruto muestra» (C5); esa tabla marca el orden y el máximo de filas en el resto.', icon: 'warning', confirmButtonColor: '#2f7cc0' });
            return false;
        }
        const limite = datosC5.packing2_c5.length;
        if (arr.length >= limite) {
            Swal.fire({ title: 'Límite alcanzado', text: 'Ya tienes ' + limite + ' registros (máximo según Pesos C5).', icon: 'info', confirmButtonColor: '#2f7cc0' });
            return false;
        }
        return true;
    }

    function eliminarFilaC5(sectionKey, index) {
        Swal.fire({
            title: '¿Eliminar fila?',
            text: 'Se eliminará la fila en todas las tablas de Recepción C5 (tiempos, pesos, temperatura, humedad, presiones y observaciones) para mantener el mismo índice de muestra.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#d33',
            cancelButtonColor: '#6c757d'
        }).then(function (result) {
            if (!result.isConfirmed) return;
            const arr = sectionKey && datosC5[sectionKey];
            if (!arr || !Array.isArray(arr) || index < 0 || index >= arr.length) return;
            var keys = ['packing1_c5', 'packing2_c5', 'packing3_c5', 'packing4_c5', 'packing5_c5', 'packing6_c5', 'packing8_c5'];
            keys.forEach(function (k) {
                var a = datosC5[k];
                if (a && Array.isArray(a) && index < a.length) a.splice(index, 1);
            });
            renderC5AllRows();
            actualizarTodosContadoresPacking();
            persistPackingSiThermoking();
            try { applyRecepcionC5TemplatePrimerInputLock(); } catch (eC5Lock) {}
        });
    }

    /** Celdas de filas ya agregadas: mismo tono gris que la plantilla cuando el valor está vacío (solo 1.ª columna “activa”). */
    function c5TdTiempoHtml(val) {
        var empty = val == null || String(val).trim() === '';
        var show = empty ? '-' : String(val).trim();
        return '<td' + (empty ? ' class="c5-td-celda-bloqueada"' : '') + '>' + show + '</td>';
    }
    function c5TdFmtHtml(val, unit) {
        var empty = val === null || val === undefined || String(val).trim() === '';
        var show = fmtPacking(empty ? '' : val, unit);
        return '<td' + (empty ? ' class="c5-td-celda-bloqueada"' : '') + '>' + show + '</td>';
    }

    function agregarFilaC5Packing1(data, tbody, num) {
        const row = document.createElement('tr');
        row.setAttribute('data-c5-packing-index', String(num - 1));
        row.innerHTML = '<td class="b-left">' + num + '</td>' +
            c5TdTiempoHtml(data.recepcion) +
            c5TdTiempoHtml(data.ingreso_gasificado) +
            c5TdTiempoHtml(data.salida_gasificado) +
            c5TdTiempoHtml(data.ingreso_prefrio) +
            c5TdTiempoHtml(data.salida_prefrio) +
            '<td class="b-right"><button type="button" class="btn-edit-row" title="Editar"><i data-lucide="pencil"></i></button><button type="button" class="btn-delete-row" title="Eliminar"><i data-lucide="trash-2"></i></button><button type="button" class="btn-replicate-row" title="Replicar"><i data-lucide="copy"></i></button></td>';
        tbody.appendChild(row);
        if (window.lucide) lucide.createIcons();
        var idx = num - 1;
        row.querySelector('.btn-edit-row').addEventListener('click', function () { editarFilaC5Packing1(idx, datosC5.packing1_c5[idx]); });
        row.querySelector('.btn-delete-row').addEventListener('click', function () { eliminarFilaC5('packing1_c5', idx); });
        row.querySelector('.btn-replicate-row').addEventListener('click', function () { replicarC5VsPeso(datosC5.packing1_c5, idx, emptyC5Packing1Row, renderC5AllRows, 'Tiempos C5'); });
    }
    function agregarFilaC5Packing2(data, tbody, num) {
        const row = document.createElement('tr');
        row.setAttribute('data-c5-packing-index', String(num - 1));
        row.innerHTML = '<td class="b-left">' + num + '</td>' +
            c5TdFmtHtml(data.peso_recepcion, 'g') +
            c5TdFmtHtml(data.peso_ingreso_gasificado, 'g') +
            c5TdFmtHtml(data.peso_salida_gasificado, 'g') +
            c5TdFmtHtml(data.peso_ingreso_prefrio, 'g') +
            c5TdFmtHtml(data.peso_salida_prefrio, 'g') +
            '<td class="b-right"><button type="button" class="btn-edit-row" title="Editar"><i data-lucide="pencil"></i></button><button type="button" class="btn-delete-row" title="Eliminar"><i data-lucide="trash-2"></i></button></td>';
        tbody.appendChild(row);
        if (window.lucide) lucide.createIcons();
        var idx = num - 1;
        row.querySelector('.btn-edit-row').addEventListener('click', function () { editarFilaC5Packing2(idx, datosC5.packing2_c5[idx]); });
        row.querySelector('.btn-delete-row').addEventListener('click', function () { eliminarFilaC5('packing2_c5', idx); });
    }
    function agregarFilaC5Packing3(data, tbody, num) {
        const row = document.createElement('tr');
        row.setAttribute('data-c5-packing-index', String(num - 1));
        row.innerHTML = '<td class="b-left">' + num + '</td>' +
            c5TdFmtHtml(data.t_amb_recep, '°C') +
            c5TdFmtHtml(data.t_pulp_recep, '°C') +
            c5TdFmtHtml(data.t_amb_ing, '°C') +
            c5TdFmtHtml(data.t_pulp_ing, '°C') +
            c5TdFmtHtml(data.t_amb_sal, '°C') +
            c5TdFmtHtml(data.t_pulp_sal, '°C') +
            c5TdFmtHtml(data.t_amb_pre_in, '°C') +
            c5TdFmtHtml(data.t_pulp_pre_in, '°C') +
            c5TdFmtHtml(data.t_amb_pre_out, '°C') +
            c5TdFmtHtml(data.t_pulp_pre_out, '°C') +
            '<td class="b-right"><button type="button" class="btn-edit-row" title="Editar"><i data-lucide="pencil"></i></button><button type="button" class="btn-delete-row" title="Eliminar"><i data-lucide="trash-2"></i></button><button type="button" class="btn-replicate-row" title="Replicar"><i data-lucide="copy"></i></button></td>';
        tbody.appendChild(row);
        if (window.lucide) lucide.createIcons();
        var idx = num - 1;
        row.querySelector('.btn-edit-row').addEventListener('click', function () { editarFilaC5Packing3(idx, datosC5.packing3_c5[idx]); });
        row.querySelector('.btn-delete-row').addEventListener('click', function () { eliminarFilaC5('packing3_c5', idx); });
        row.querySelector('.btn-replicate-row').addEventListener('click', function () { replicarC5VsPeso(datosC5.packing3_c5, idx, emptyC5Packing3Row, renderC5AllRows, 'Temperatura C5'); });
    }
    function agregarFilaC5Packing4(data, tbody, num) {
        const row = document.createElement('tr');
        row.setAttribute('data-c5-packing-index', String(num - 1));
        row.innerHTML = '<td class="b-left">' + num + '</td>' +
            c5TdFmtHtml(data.recepcion, '%') +
            c5TdFmtHtml(data.ingreso_gasificado, '%') +
            c5TdFmtHtml(data.salida_gasificado, '%') +
            c5TdFmtHtml(data.ingreso_prefrio, '%') +
            c5TdFmtHtml(data.salida_prefrio, '%') +
            '<td class="b-right"><button type="button" class="btn-edit-row" title="Editar"><i data-lucide="pencil"></i></button><button type="button" class="btn-delete-row" title="Eliminar"><i data-lucide="trash-2"></i></button><button type="button" class="btn-replicate-row" title="Replicar"><i data-lucide="copy"></i></button></td>';
        tbody.appendChild(row);
        if (window.lucide) lucide.createIcons();
        var idx = num - 1;
        row.querySelector('.btn-edit-row').addEventListener('click', function () { editarFilaC5Packing4(idx, datosC5.packing4_c5[idx]); });
        row.querySelector('.btn-delete-row').addEventListener('click', function () { eliminarFilaC5('packing4_c5', idx); });
        row.querySelector('.btn-replicate-row').addEventListener('click', function () { replicarC5VsPeso(datosC5.packing4_c5, idx, emptyC5Packing4Row, renderC5AllRows, 'Humedad C5'); });
    }
    function agregarFilaC5Packing5(data, tbody, num) {
        const row = document.createElement('tr');
        row.setAttribute('data-c5-packing-index', String(num - 1));
        row.innerHTML = '<td class="b-left">' + num + '</td>' +
            c5TdFmtHtml(data.recepcion, ' Kpa') +
            c5TdFmtHtml(data.ingreso_gasificado, ' Kpa') +
            c5TdFmtHtml(data.salida_gasificado, ' Kpa') +
            c5TdFmtHtml(data.ingreso_prefrio, ' Kpa') +
            c5TdFmtHtml(data.salida_prefrio, ' Kpa') +
            '<td class="b-right"><button type="button" class="btn-edit-row" title="Editar"><i data-lucide="pencil"></i></button><button type="button" class="btn-delete-row" title="Eliminar"><i data-lucide="trash-2"></i></button><button type="button" class="btn-replicate-row" title="Replicar"><i data-lucide="copy"></i></button></td>';
        tbody.appendChild(row);
        if (window.lucide) lucide.createIcons();
        var idx = num - 1;
        row.querySelector('.btn-edit-row').addEventListener('click', function () { editarFilaC5Packing5(idx, datosC5.packing5_c5[idx]); });
        row.querySelector('.btn-delete-row').addEventListener('click', function () { eliminarFilaC5('packing5_c5', idx); });
        row.querySelector('.btn-replicate-row').addEventListener('click', function () { replicarC5VsPeso(datosC5.packing5_c5, idx, emptyC5Packing5Row, renderC5AllRows, 'Presión ambiente C5'); });
    }
    function agregarFilaC5Packing6(data, tbody, num) {
        const row = document.createElement('tr');
        row.setAttribute('data-c5-packing-index', String(num - 1));
        row.innerHTML = '<td class="b-left">' + num + '</td>' +
            c5TdFmtHtml(data.recepcion, ' Kpa') +
            c5TdFmtHtml(data.ingreso_gasificado, ' Kpa') +
            c5TdFmtHtml(data.salida_gasificado, ' Kpa') +
            c5TdFmtHtml(data.ingreso_prefrio, ' Kpa') +
            c5TdFmtHtml(data.salida_prefrio, ' Kpa') +
            '<td class="b-right"><button type="button" class="btn-edit-row" title="Editar"><i data-lucide="pencil"></i></button><button type="button" class="btn-delete-row" title="Eliminar"><i data-lucide="trash-2"></i></button><button type="button" class="btn-replicate-row" title="Replicar"><i data-lucide="copy"></i></button></td>';
        tbody.appendChild(row);
        if (window.lucide) lucide.createIcons();
        var idx = num - 1;
        row.querySelector('.btn-edit-row').addEventListener('click', function () { editarFilaC5Packing6(idx, datosC5.packing6_c5[idx]); });
        row.querySelector('.btn-delete-row').addEventListener('click', function () { eliminarFilaC5('packing6_c5', idx); });
        row.querySelector('.btn-replicate-row').addEventListener('click', function () { replicarC5VsPeso(datosC5.packing6_c5, idx, emptyC5Packing6Row, renderC5AllRows, 'Presión fruta C5'); });
    }
    function agregarFilaC5Packing8(data, tbody, num) {
        const row = document.createElement('tr');
        row.setAttribute('data-c5-packing-index', String(num - 1));
        var obs = ((data.observacion || '').trim());
        var emptyObs = !obs;
        row.innerHTML = '<td class="b-left">' + num + '</td><td' + (emptyObs ? ' class="c5-td-celda-bloqueada"' : '') + '>' + (obs || '-') + '</td><td class="b-right"><button type="button" class="btn-edit-row" title="Editar"><i data-lucide="pencil"></i></button><button type="button" class="btn-delete-row" title="Eliminar"><i data-lucide="trash-2"></i></button><button type="button" class="btn-replicate-row" title="Replicar"><i data-lucide="copy"></i></button></td>';
        tbody.appendChild(row);
        if (window.lucide) lucide.createIcons();
        var idx = num - 1;
        row.querySelector('.btn-edit-row').addEventListener('click', function () { editarFilaC5Packing8(idx, datosC5.packing8_c5[idx]); });
        row.querySelector('.btn-delete-row').addEventListener('click', function () { eliminarFilaC5('packing8_c5', idx); });
        row.querySelector('.btn-replicate-row').addEventListener('click', function () { replicarC5VsPeso(datosC5.packing8_c5, idx, emptyC5Packing8Row, renderC5AllRows, 'Observaciones C5'); });
    }
    function renderC5AllRows() {
        var t1 = document.getElementById('tbody-packing-1_c5');
        var t2 = document.getElementById('tbody-packing-pesos_c5');
        var t3 = document.getElementById('tbody-packing-temp_c5');
        var t4 = document.getElementById('tbody-packing-humedad_c5');
        var t5 = document.getElementById('tbody-packing-presion_c5');
        var t6 = document.getElementById('tbody-packing-presion-fruta_c5');
        var t8 = document.getElementById('tbody-packing-obs_c5');
        if (t1) { t1.innerHTML = ''; datosC5.packing1_c5.forEach(function (d, i) { agregarFilaC5Packing1(d, t1, i + 1); }); }
        if (t2) { t2.innerHTML = ''; datosC5.packing2_c5.forEach(function (d, i) { agregarFilaC5Packing2(d, t2, i + 1); }); }
        if (t3) { t3.innerHTML = ''; datosC5.packing3_c5.forEach(function (d, i) { agregarFilaC5Packing3(d, t3, i + 1); }); }
        if (t4) { t4.innerHTML = ''; datosC5.packing4_c5.forEach(function (d, i) { agregarFilaC5Packing4(d, t4, i + 1); }); }
        if (t5) { t5.innerHTML = ''; datosC5.packing5_c5.forEach(function (d, i) { agregarFilaC5Packing5(d, t5, i + 1); }); }
        if (t6) { t6.innerHTML = ''; datosC5.packing6_c5.forEach(function (d, i) { agregarFilaC5Packing6(d, t6, i + 1); }); }
        if (t8) { t8.innerHTML = ''; datosC5.packing8_c5.forEach(function (d, i) { agregarFilaC5Packing8(d, t8, i + 1); }); }
        try { applyRecepcionC5TemplatePrimerInputLock(); } catch (eR5) {}
    }

    function renderAllPackingRows() {
        const t1 = document.getElementById('tbody-packing-1');
        const t2 = document.getElementById('tbody-packing-pesos');
        const t3 = document.getElementById('tbody-packing-temp');
        const t4 = document.getElementById('tbody-packing-humedad');
        const t5 = document.getElementById('tbody-packing-presion');
        const t6 = document.getElementById('tbody-packing-presion-fruta');
        const t8 = document.getElementById('tbody-packing-obs');
        if (t1) { t1.innerHTML = ''; datosPacking.packing1.forEach((d, i) => agregarFilaPacking1(d, t1, i + 1)); }
        if (t2) { t2.innerHTML = ''; datosPacking.packing2.forEach((d, i) => agregarFilaPacking2(d, t2, i + 1)); }
        if (t3) { t3.innerHTML = ''; datosPacking.packing3.forEach((d, i) => agregarFilaPacking3(d, t3, i + 1)); }
        if (t4) { t4.innerHTML = ''; datosPacking.packing4.forEach((d, i) => agregarFilaPacking4(d, t4, i + 1)); }
        if (t5) { t5.innerHTML = ''; datosPacking.packing5.forEach((d, i) => agregarFilaPacking5(d, t5, i + 1)); }
        if (t6) { t6.innerHTML = ''; datosPacking.packing6.forEach((d, i) => agregarFilaPacking6(d, t6, i + 1)); }
        if (t8) { t8.innerHTML = ''; datosPacking.packing8.forEach((d, i) => agregarFilaPacking8(d, t8, i + 1)); }
        renderThermokingTempRows();
        renderThermokingObsRows();
        renderThermokingTiemposRows();
        renderThermokingPesoTkRows();
        renderThermokingHumedadTkRows();
        renderThermokingPresionTkRows();
        renderThermokingVaporRows();
        renderC5AllRows();
        actualizarTodosContadoresPacking();
        scheduleRefrescarUiEstadoRc5();
    }

    const modalGrid = (labels, inputsHtml) => `<div class="packing-modal-grid">${labels.map((l, i) => `<div class="packing-modal-field"><label>${l}</label>${inputsHtml[i]}</div>`).join('')}</div>`;

    /** Validación Packing 1: recepcion ≤ ingreso_gas ≤ salida_gas ≤ ingreso_prefrio ≤ salida_prefrio (tiempos progresivos, igual o mayor). Requiere todos llenos. */
    function validarPacking1Tiempos(data) {
        const r = (data.recepcion || '').trim();
        const ig = (data.ingreso_gasificado || '').trim();
        const sg = (data.salida_gasificado || '').trim();
        const ip = (data.ingreso_prefrio || '').trim();
        const sp = (data.salida_prefrio || '').trim();
        if (!r || !ig || !sg || !ip || !sp) return { ok: false, msg: 'Todos los tiempos deben estar llenos.' };
        if (ig < r) return { ok: false, msg: 'Recep. ≤ In Gas. (In Gas. debe ser mayor o igual).' };
        if (sg < ig) return { ok: false, msg: 'In Gas. ≤ Out Gas. (Out Gas. debe ser mayor o igual).' };
        if (ip < sg) return { ok: false, msg: 'Out Gas. ≤ In Pre. (In Pre. debe ser mayor o igual).' };
        if (sp < ip) return { ok: false, msg: 'In Pre. ≤ Out Pre. (Out Pre. debe ser mayor o igual).' };
        return { ok: true };
    }

    /** Validación Packing 1 para editar/agregar: permite campos vacíos; orden de tiempos es solo aviso (warnOrden), no bloquea. */
    function validarPacking1TiemposOpcional(data) {
        var recep = (data.recepcion || '').trim();
        var inGas = (data.ingreso_gasificado || '').trim();
        var outGas = (data.salida_gasificado || '').trim();
        var inPre = (data.ingreso_prefrio || '').trim();
        var outPre = (data.salida_prefrio || '').trim();
        var ordenMsgs = [];
        if (recep && inGas && inGas < recep) ordenMsgs.push('Recep. ≤ In Gas. (In Gas. debe ser mayor o igual).');
        if (inGas && outGas && outGas < inGas) ordenMsgs.push('In Gas. ≤ Out Gas. (Out Gas. debe ser mayor o igual).');
        if (outGas && inPre && inPre < outGas) ordenMsgs.push('Out Gas. ≤ In Pre. (In Pre. debe ser mayor o igual).');
        if (inPre && outPre && outPre < inPre) ordenMsgs.push('In Pre. ≤ Out Pre. (Out Pre. debe ser mayor o igual).');
        return { ok: true, warnOrden: ordenMsgs.length ? ordenMsgs.join(' ') : null };
    }

    /** Máximo permitido para Peso Recepción en packing fila index: Despacho Acopio de la fila (desde datos Visual en memoria o desde GET). Si no hay dato, devuelve null (no se valida tope). */
    function getMaxPesoRecepcionPacking(indexFila) {
        var ensayo = ensayoActual != null ? ensayoActual : currentEnsayoPacking;
        if (ensayo == null) return null;
        var visual = (datosEnsayos.visual && datosEnsayos.visual[ensayo] && datosEnsayos.visual[ensayo].visual && datosEnsayos.visual[ensayo].visual.length)
            ? datosEnsayos.visual[ensayo].visual
            : (datosEnsayos.acopio && datosEnsayos.acopio[ensayo] && datosEnsayos.acopio[ensayo].visual ? datosEnsayos.acopio[ensayo].visual : []);
        var row = visual[indexFila];
        var despacho = row && (row.despacho_acopio != null ? row.despacho_acopio : row.despacho);
        if (row && despacho != null && String(despacho).trim() !== '') {
            var n = parseFloat(String(despacho).replace(',', '.'));
            if (!isNaN(n)) return n;
        }
        var key = keyPacking(currentFechaPacking, currentEnsayoPacking);
        if (despachoPorFilaDesdeGET[key] && despachoPorFilaDesdeGET[key][indexFila] != null) return despachoPorFilaDesdeGET[key][indexFila];
        return null;
    }

    /** Validación Packing 2: Recep. ≥ In Gas. ≥ Out Gas. ≥ In Pre. ≥ Out Pre. Requiere todos llenos. Mensaje específico por par. */
    function validarPacking2Pesos(data) {
        const pr = parseFloat(String(data.peso_recepcion || '').replace(',', '.'));
        const pig = parseFloat(String(data.peso_ingreso_gasificado || '').replace(',', '.'));
        const psg = parseFloat(String(data.peso_salida_gasificado || '').replace(',', '.'));
        const pip = parseFloat(String(data.peso_ingreso_prefrio || '').replace(',', '.'));
        const psp = parseFloat(String(data.peso_salida_prefrio || '').replace(',', '.'));
        if (isNaN(pr) || isNaN(pig) || isNaN(psg) || isNaN(pip) || isNaN(psp)) return { ok: false, msg: 'Todos los pesos deben ser números.' };
        if (pig > pr) return { ok: false, msg: 'Recep. ≥ In Gas. (In Gas. debe ser menor o igual).' };
        if (psg > pig) return { ok: false, msg: 'In Gas. ≥ Out Gas. (Out Gas. debe ser menor o igual).' };
        if (pip > psg) return { ok: false, msg: 'Out Gas. ≥ In Pre. (In Pre. debe ser menor o igual).' };
        if (psp > pip) return { ok: false, msg: 'In Pre. ≥ Out Pre. (Out Pre. debe ser menor o igual).' };
        return { ok: true };
    }

    /** Validación Packing 2 para editar/agregar: números inválidos bloquean; orden Recep. ≥ … es solo aviso (warnOrden). */
    function validarPacking2PesosOpcional(data) {
        var nums = [
            parseFloat(String(data.peso_recepcion || '').replace(',', '.')),
            parseFloat(String(data.peso_ingreso_gasificado || '').replace(',', '.')),
            parseFloat(String(data.peso_salida_gasificado || '').replace(',', '.')),
            parseFloat(String(data.peso_ingreso_prefrio || '').replace(',', '.')),
            parseFloat(String(data.peso_salida_prefrio || '').replace(',', '.'))
        ];
        var filled = [(data.peso_recepcion || '').trim(), (data.peso_ingreso_gasificado || '').trim(), (data.peso_salida_gasificado || '').trim(), (data.peso_ingreso_prefrio || '').trim(), (data.peso_salida_prefrio || '').trim()];
        for (var i = 0; i < filled.length; i++) {
            if (filled[i] && (isNaN(nums[i]) || nums[i] < 0)) return { ok: false, msg: 'Los pesos deben ser números mayores o iguales a 0.' };
        }
        var ordenMsgs = [];
        if (!isNaN(nums[0]) && !isNaN(nums[1]) && nums[1] > nums[0]) ordenMsgs.push('Recep. ≥ In Gas. (In Gas. debe ser menor o igual).');
        if (!isNaN(nums[1]) && !isNaN(nums[2]) && nums[2] > nums[1]) ordenMsgs.push('In Gas. ≥ Out Gas. (Out Gas. debe ser menor o igual).');
        if (!isNaN(nums[2]) && !isNaN(nums[3]) && nums[3] > nums[2]) ordenMsgs.push('Out Gas. ≥ In Pre. (In Pre. debe ser menor o igual).');
        if (!isNaN(nums[3]) && !isNaN(nums[4]) && nums[4] > nums[3]) ordenMsgs.push('In Pre. ≥ Out Pre. (Out Pre. debe ser menor o igual).');
        return { ok: true, warnOrden: ordenMsgs.length ? ordenMsgs.join(' ') : null };
    }

    /** Validación cadena pesos: Recep. ≥ In Gas. ≥ Out Gas. ≥ In Pre. ≥ Out Pre. valores = [recep, in_gas, out_gas, in_pre, out_pre]. Devuelve { valid, errors: [{ index, msg }] }. Vacíos se ignoran. */
    function validarPesosPackingCadena(valores) {
        var nums = valores.map(function (v) {
            var s = String(v || '').trim();
            if (s === '') return NaN;
            return parseFloat(s.replace(',', '.'));
        });
        var errors = [];
        if (!isNaN(nums[1]) && !isNaN(nums[0]) && nums[1] > nums[0]) errors.push({ index: 1, msg: 'Recep. ≥ In Gas. (In Gas. debe ser menor o igual).' });
        if (!isNaN(nums[2]) && !isNaN(nums[1]) && nums[2] > nums[1]) errors.push({ index: 2, msg: 'In Gas. ≥ Out Gas. (Out Gas. debe ser menor o igual).' });
        if (!isNaN(nums[3]) && !isNaN(nums[2]) && nums[3] > nums[2]) errors.push({ index: 3, msg: 'Out Gas. ≥ In Pre. (In Pre. debe ser menor o igual).' });
        if (!isNaN(nums[4]) && !isNaN(nums[3]) && nums[4] > nums[3]) errors.push({ index: 4, msg: 'In Pre. ≥ Out Pre. (Out Pre. debe ser menor o igual).' });
        for (var j = 0; j < nums.length; j++) {
            if (!isNaN(nums[j]) && nums[j] < 0) errors.push({ index: j, msg: 'El peso debe ser ≥ 0.' });
        }
        return { valid: errors.length === 0, errors: errors };
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

    /** Peso salida prefrío (packing) como tope: misma fila en packing2 o campo fijo reg_packing_peso_salida_prefrio. */
    function obtenerRefPesoSalidaPrefrioParaFilaTk(filaIndex) {
        var idx = typeof filaIndex === 'number' && filaIndex >= 0 ? filaIndex : 0;
        var p2 = datosPacking && datosPacking.packing2 && datosPacking.packing2[idx];
        if (p2 && String(p2.peso_salida_prefrio || '').trim() !== '') {
            var n = parseFloat(String(p2.peso_salida_prefrio).replace(',', '.'));
            if (!isNaN(n)) return n;
        }
        var el = document.getElementById('reg_packing_peso_salida_prefrio');
        if (el && String(el.value || '').trim() !== '') {
            var n2 = parseFloat(String(el.value).replace(',', '.'));
            if (!isNaN(n2)) return n2;
        }
        return null;
    }

    /** Thermo King — peso (g): Ing. cám. e Inic. trasl. ≤ salida prefrío packing; Sal. cám. ≤ Ing. cám.; Despacho ≤ Inic. trasl. */
    function validarThermokingPesoCadenaCreciente(valores, filaIndex) {
        function num(v) {
            var s = String(v ?? '').trim();
            if (s === '') return NaN;
            return parseFloat(s.replace(',', '.'));
        }
        /** Texto del límite en g para el mensaje (ej. "1" o "1.25"). */
        function fmtLimG(n) {
            if (isNaN(n)) return '';
            var r = Math.round(Number(n) * 1000) / 1000;
            if (Math.abs(r - Math.round(r)) < 1e-9) return String(Math.round(r));
            return String(r);
        }
        var idx = (typeof filaIndex === 'number' && filaIndex >= 0) ? filaIndex : 0;
        var ic = num(valores[0]);
        var st = num(valores[1]);
        var it = num(valores[2]);
        var dp = num(valores[3]);
        var ref = obtenerRefPesoSalidaPrefrioParaFilaTk(idx);

        if (ref != null && !isNaN(ref)) {
            if (!isNaN(ic) && ic > ref) return { ok: false, msg: 'Ing. cámara MP (g) debe ser ≤ peso salida prefrío (packing): ' + fmtLimG(ref) + ' g.' };
            if (!isNaN(it) && it > ref) return { ok: false, msg: 'Inic. trasl. T-H (g) debe ser ≤ peso salida prefrío (packing): ' + fmtLimG(ref) + ' g.' };
        }
        if (!isNaN(ic) && !isNaN(st) && st > ic) return { ok: false, msg: 'Sal. cám. MP (g) debe ser ≤ Ing. cámara MP (g): ' + fmtLimG(ic) + ' g.' };
        if (!isNaN(it) && !isNaN(dp) && dp > it) return { ok: false, msg: 'Despacho T-H (g) debe ser ≤ Inic. trasl. T-H (g): ' + fmtLimG(it) + ' g.' };

        // Regla adicional solicitada: no superar el Despacho Acopio de la fila.
        var refDespachoAcopio = getMaxPesoRecepcionPacking(idx);
        var limite = (refDespachoAcopio != null && !isNaN(refDespachoAcopio)) ? refDespachoAcopio : null;
        if (limite != null && !isNaN(limite)) {
            var checks = [
                { v: ic, label: 'Ing. cámara MP' },
                { v: st, label: 'Sal. cám. MP' },
                { v: it, label: 'Inic. trasl. T-H' },
                { v: dp, label: 'Despacho T-H' }
            ];
            for (var ci = 0; ci < checks.length; ci++) {
                if (!isNaN(checks[ci].v) && checks[ci].v > limite) {
                    return {
                        ok: false,
                        msg: checks[ci].label + ' (g) no puede ser mayor que ' + fmtLimG(limite) + ' g (límite por Despacho Acopio).'
                    };
                }
            }
        }
        return { ok: true };
    }

    /** Thermo King — tiempos (hora): cadena Ing. cám. → Sal. cám. → Inic. trasl. T-H → Despacho T-H no decreciente. Solo compara pares donde ambos valores están llenos. */
    function validarThermokingTiempoCadenaCreciente(valores) {
        var labels = ['Ing. cámara MP', 'Sal. cám. MP', 'Inic. trasl. T-H', 'Despacho T-H'];
        var mins = valores.map(function (v) {
            var s = String(v ?? '').trim();
            if (s === '') return NaN;
            var p = s.split(':');
            if (p.length < 2) return NaN;
            var h = parseInt(p[0], 10);
            var m = parseInt(p[1], 10);
            if (isNaN(h) || isNaN(m)) return NaN;
            return (h * 60) + m;
        });
        for (var i = 0; i < mins.length - 1; i++) {
            if (!isNaN(mins[i]) && !isNaN(mins[i + 1]) && mins[i + 1] < mins[i]) {
                return { ok: false, msg: labels[i] + ' ≤ ' + labels[i + 1] + ' (la hora debe ir en orden creciente; ' + labels[i + 1] + ' no puede ser menor que ' + labels[i] + ').' };
            }
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
                var res = validarPacking1TiemposOpcional(val);
                if (res.warnOrden) { Swal.showValidationMessage(res.warnOrden); return false; }
                return val;
            }
        }).then(function (r) {
            if (!r.isConfirmed || !r.value) return;
            datosPacking.packing1[index] = r.value;
            renderAllPackingRows();
        });
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
                const res = validarPacking2PesosOpcional(val);
                if (!res.ok) { Swal.showValidationMessage(res.msg); return false; }
                if (res.warnOrden) { Swal.showValidationMessage(res.warnOrden); return false; }
                var maxRecepcion = getMaxPesoRecepcionPacking(index);
                if (maxRecepcion != null && String(val.peso_recepcion || '').trim() !== '') {
                    var prNum = parseFloat(String(val.peso_recepcion).replace(',', '.'));
                    if (!isNaN(prNum) && prNum > maxRecepcion) {
                        Swal.showValidationMessage('Peso Recepción supera el Despacho Acopio (máx. ' + maxRecepcion + '). Corrige el valor antes de registrar la fila.');
                        return false;
                    }
                }
                return val;
            }
        }).then(function (r) {
            if (!r.isConfirmed || !r.value) return;
            var val = r.value;
            datosPacking.packing2[index] = val;
            renderAllPackingRows();
        });
    }
    function editarFilaPacking3(index, dataActual) {
        var stages = [
            { name: 'Recepción', amb: (dataActual.t_amb_recep ?? ''), pulp: (dataActual.t_pulp_recep ?? '') },
            { name: 'In Gas.', amb: (dataActual.t_amb_ing ?? ''), pulp: (dataActual.t_pulp_ing ?? '') },
            { name: 'Out Gas.', amb: (dataActual.t_amb_sal ?? ''), pulp: (dataActual.t_pulp_sal ?? '') },
            { name: 'In Pre.', amb: (dataActual.t_amb_pre_in ?? ''), pulp: (dataActual.t_pulp_pre_in ?? '') },
            { name: 'Out Pre.', amb: (dataActual.t_amb_pre_out ?? ''), pulp: (dataActual.t_pulp_pre_out ?? '') }
        ];
        var idsAmb = ['e_t1','e_t3','e_t5','e_t7','e_t9'];
        var idsPulp = ['e_t2','e_t4','e_t6','e_t8','e_t10'];
        var html = '<div class="packing-modal-temp-2cols">';
        stages.forEach(function (s, i) {
            html += '<div class="temp-stage-row">';
            html += '<div class="temp-stage-name">' + s.name + '</div>';
            html += '<div class="temp-stage-fields">';
            html += '<div class="temp-field"><label title="T° Ambiente"><i data-lucide="thermometer-sun" class="temp-icon"></i> T° Amb</label><input type="number" step="0.1" min="0" id="' + idsAmb[i] + '" class="swal2-input" value="' + (s.amb !== undefined && s.amb !== null ? s.amb : '') + '"></div>';
            html += '<div class="temp-field"><label title="T° Pulpa"><i data-lucide="cherry" class="temp-icon"></i> T° Pulp</label><input type="number" step="0.1" min="0" id="' + idsPulp[i] + '" class="swal2-input" value="' + (s.pulp !== undefined && s.pulp !== null ? s.pulp : '') + '"></div>';
            html += '</div></div>';
        });
        html += '</div>';
        var numFila = index + 1;
        Swal.fire({
            title: 'Editar Temperaturas (°C) — Fila #' + numFila,
            customClass: { popup: 'packing-edit-modal packing-edit-modal-temp' },
            html: html,
            showCancelButton: true,
            confirmButtonText: 'Guardar',
            cancelButtonText: 'Cancelar',
            didOpen: function () { if (window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons(); },
            preConfirm: () => {
                const v = [document.getElementById('e_t1').value, document.getElementById('e_t2').value, document.getElementById('e_t3').value, document.getElementById('e_t4').value, document.getElementById('e_t5').value, document.getElementById('e_t6').value, document.getElementById('e_t7').value, document.getElementById('e_t8').value, document.getElementById('e_t9').value, document.getElementById('e_t10').value];
                const res = validarPackingNumericoOpcional(v);
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
                const res = validarPackingNumericoOpcional(val);
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
                const res = validarPackingNumericoOpcional(val);
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
                const res = validarPackingNumericoOpcional(val);
                if (!res.ok) { Swal.showValidationMessage(res.msg); return false; }
                return { recepcion: val[0], ingreso_gasificado: val[1], salida_gasificado: val[2], ingreso_prefrio: val[3], salida_prefrio: val[4] };
            }
        }).then(r => { if (r.isConfirmed && r.value) { datosPacking.packing6[index] = r.value; renderAllPackingRows(); } });
    }
    function editarFilaPacking8(index, dataActual) {
        var numFila = index + 1;
        Swal.fire({ title: 'Editar Observación — Fila #' + numFila, customClass: { popup: 'packing-edit-modal' }, input: 'text', inputValue: (dataActual.observacion || '').toString(), showCancelButton: true, confirmButtonText: 'Guardar', cancelButtonText: 'Cancelar' }).then(r => { if (r.isConfirmed && r.value !== undefined) { datosPacking.packing8[index] = { observacion: r.value }; renderAllPackingRows(); } });
    }

    function editarFilaC5Packing1(index, dataActual) {
        const labels = ['Recep.', 'In Gas.', 'Out Gas.', 'In Pre.', 'Out Pre.'];
        const ids = ['c5m_tr1', 'c5m_tr2', 'c5m_tr3', 'c5m_tr4', 'c5m_tr5'];
        const vals = [dataActual.recepcion, dataActual.ingreso_gasificado, dataActual.salida_gasificado, dataActual.ingreso_prefrio, dataActual.salida_prefrio];
        const inputs = ids.map((id, i) => `<input type="time" id="${id}" class="swal2-input" value="${vals[i] || ''}">`);
        var numFila = index + 1;
        Swal.fire({
            title: 'C5 — Editar Tiempos — Fila #' + numFila,
            customClass: { popup: 'packing-edit-modal' },
            html: modalGrid(labels, inputs),
            showCancelButton: true,
            confirmButtonText: 'Guardar',
            cancelButtonText: 'Cancelar',
            didOpen: function () {
                ['c5m_tr2', 'c5m_tr3', 'c5m_tr4', 'c5m_tr5'].forEach(function (id) {
                    c5SetSwalInputBloqueado(document.getElementById(id), true);
                });
            },
            preConfirm: function () {
                const val = { recepcion: document.getElementById('c5m_tr1').value, ingreso_gasificado: document.getElementById('c5m_tr2').value, salida_gasificado: document.getElementById('c5m_tr3').value, ingreso_prefrio: document.getElementById('c5m_tr4').value, salida_prefrio: document.getElementById('c5m_tr5').value };
                const vv = [val.recepcion, val.ingreso_gasificado, val.salida_gasificado, val.ingreso_prefrio, val.salida_prefrio];
                if (!vv.some(function (x) { return String(x || '').trim() !== ''; })) {
                    Swal.showValidationMessage('Debe guardar al menos un dato o pulse Cancelar.');
                    return false;
                }
                var res = validarPacking1TiemposOpcional(val);
                if (res.warnOrden) { Swal.showValidationMessage(res.warnOrden); return false; }
                return val;
            }
        }).then(function (r) {
            if (!r.isConfirmed || !r.value) return;
            datosC5.packing1_c5[index] = r.value;
            renderAllPackingRows();
            persistPackingSiThermoking();
        });
    }
    function editarFilaC5Packing2(index, dataActual) {
        const labels = ['Recep. (gr)', 'In Gas. (gr)', 'Out Gas. (gr)', 'In Pre. (gr)', 'Out Pre. (gr)'];
        const ids = ['c5m_pw1', 'c5m_pw2', 'c5m_pw3', 'c5m_pw4', 'c5m_pw5'];
        const vals = [dataActual.peso_recepcion, dataActual.peso_ingreso_gasificado, dataActual.peso_salida_gasificado, dataActual.peso_ingreso_prefrio, dataActual.peso_salida_prefrio];
        const inputs = ids.map((id, i) => `<input type="number" step="0.1" min="0" id="${id}" class="swal2-input" value="${vals[i] ?? ''}">`);
        var numFila = index + 1;
        Swal.fire({
            title: 'C5 — Editar Pesos — Fila #' + numFila,
            customClass: { popup: 'packing-edit-modal' },
            html: modalGrid(labels, inputs),
            showCancelButton: true,
            confirmButtonText: 'Guardar',
            cancelButtonText: 'Cancelar',
            didOpen: function () {
                ['c5m_pw2', 'c5m_pw3', 'c5m_pw4', 'c5m_pw5'].forEach(function (id) {
                    c5SetSwalInputBloqueado(document.getElementById(id), true);
                });
            },
            preConfirm: function () {
                const val = { peso_recepcion: document.getElementById('c5m_pw1').value, peso_ingreso_gasificado: document.getElementById('c5m_pw2').value, peso_salida_gasificado: document.getElementById('c5m_pw3').value, peso_ingreso_prefrio: document.getElementById('c5m_pw4').value, peso_salida_prefrio: document.getElementById('c5m_pw5').value };
                const vv = [val.peso_recepcion, val.peso_ingreso_gasificado, val.peso_salida_gasificado, val.peso_ingreso_prefrio, val.peso_salida_prefrio];
                if (!vv.some(function (x) { return String(x || '').trim() !== ''; })) {
                    Swal.showValidationMessage('Debe guardar al menos un dato o pulse Cancelar.');
                    return false;
                }
                const res = validarPacking2PesosOpcional(val);
                if (!res.ok) { Swal.showValidationMessage(res.msg); return false; }
                if (res.warnOrden) { Swal.showValidationMessage(res.warnOrden); return false; }
                var maxRecepcion = getMaxPesoRecepcionPacking(index);
                if (maxRecepcion != null && String(val.peso_recepcion || '').trim() !== '') {
                    var prNum = parseFloat(String(val.peso_recepcion).replace(',', '.'));
                    if (!isNaN(prNum) && prNum > maxRecepcion) {
                        Swal.showValidationMessage('Peso Recepción supera el Despacho Acopio (máx. ' + maxRecepcion + '). Corrige el valor antes de registrar la fila.');
                        return false;
                    }
                }
                return val;
            }
        }).then(function (r) {
            if (!r.isConfirmed || !r.value) return;
            var val = r.value;
            datosC5.packing2_c5[index] = val;
            renderAllPackingRows();
            persistPackingSiThermoking();
        });
    }
    function editarFilaC5Packing3(index, dataActual) {
        var stages = [
            { name: 'Recepción', amb: (dataActual.t_amb_recep ?? ''), pulp: (dataActual.t_pulp_recep ?? '') },
            { name: 'In Gas.', amb: (dataActual.t_amb_ing ?? ''), pulp: (dataActual.t_pulp_ing ?? '') },
            { name: 'Out Gas.', amb: (dataActual.t_amb_sal ?? ''), pulp: (dataActual.t_pulp_sal ?? '') },
            { name: 'In Pre.', amb: (dataActual.t_amb_pre_in ?? ''), pulp: (dataActual.t_pulp_pre_in ?? '') },
            { name: 'Out Pre.', amb: (dataActual.t_amb_pre_out ?? ''), pulp: (dataActual.t_pulp_pre_out ?? '') }
        ];
        var idsAmb = ['c5m_ca1', 'c5m_ca3', 'c5m_ca5', 'c5m_ca7', 'c5m_ca9'];
        var idsPulp = ['c5m_ca2', 'c5m_ca4', 'c5m_ca6', 'c5m_ca8', 'c5m_ca10'];
        var html = '<div class="packing-modal-temp-2cols">';
        stages.forEach(function (s, i) {
            html += '<div class="temp-stage-row">';
            html += '<div class="temp-stage-name">' + s.name + '</div>';
            html += '<div class="temp-stage-fields">';
            html += '<div class="temp-field"><label title="T° Ambiente"><i data-lucide="thermometer-sun" class="temp-icon"></i> T° Amb</label><input type="number" step="0.1" min="0" id="' + idsAmb[i] + '" class="swal2-input" value="' + (s.amb !== undefined && s.amb !== null ? s.amb : '') + '"></div>';
            html += '<div class="temp-field"><label title="T° Pulpa"><i data-lucide="cherry" class="temp-icon"></i> T° Pulp</label><input type="number" step="0.1" min="0" id="' + idsPulp[i] + '" class="swal2-input" value="' + (s.pulp !== undefined && s.pulp !== null ? s.pulp : '') + '"></div>';
            html += '</div></div>';
        });
        html += '</div>';
        var numFila = index + 1;
        Swal.fire({
            title: 'C5 — Editar Temperaturas (°C) — Fila #' + numFila,
            customClass: { popup: 'packing-edit-modal packing-edit-modal-temp' },
            html: html,
            showCancelButton: true,
            confirmButtonText: 'Guardar',
            cancelButtonText: 'Cancelar',
            didOpen: function () {
                var k;
                for (k = 3; k <= 10; k++) {
                    c5SetSwalInputBloqueado(document.getElementById('c5m_ca' + k), true);
                }
                if (window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons();
            },
            preConfirm: function () {
                const v = [document.getElementById('c5m_ca1').value, document.getElementById('c5m_ca2').value, document.getElementById('c5m_ca3').value, document.getElementById('c5m_ca4').value, document.getElementById('c5m_ca5').value, document.getElementById('c5m_ca6').value, document.getElementById('c5m_ca7').value, document.getElementById('c5m_ca8').value, document.getElementById('c5m_ca9').value, document.getElementById('c5m_ca10').value];
                if (!v.some(function (x) { return String(x || '').trim() !== ''; })) {
                    Swal.showValidationMessage('Debe guardar al menos un dato o pulse Cancelar.');
                    return false;
                }
                const res = validarPackingNumericoOpcional(v);
                if (!res.ok) { Swal.showValidationMessage(res.msg); return false; }
                return { t_amb_recep: v[0], t_pulp_recep: v[1], t_amb_ing: v[2], t_pulp_ing: v[3], t_amb_sal: v[4], t_pulp_sal: v[5], t_amb_pre_in: v[6], t_pulp_pre_in: v[7], t_amb_pre_out: v[8], t_pulp_pre_out: v[9] };
            }
        }).then(function (r) { if (r.isConfirmed && r.value) { datosC5.packing3_c5[index] = r.value; renderAllPackingRows(); persistPackingSiThermoking(); } });
    }
    function editarFilaC5Packing4(index, dataActual) {
        const labels = ['Recep.', 'In Gas.', 'Out Gas.', 'In Pre.', 'Out Pre.'];
        const v = [dataActual.recepcion, dataActual.ingreso_gasificado, dataActual.salida_gasificado, dataActual.ingreso_prefrio, dataActual.salida_prefrio];
        const inputs = [0, 1, 2, 3, 4].map(function (i) { return '<input type="number" step="0.1" min="0" id="c5m_hu' + i + '" class="swal2-input" value="' + (v[i] ?? '') + '">'; });
        var numFila = index + 1;
        Swal.fire({
            title: 'C5 — Editar Humedad — Fila #' + numFila,
            customClass: { popup: 'packing-edit-modal' },
            html: modalGrid(labels, inputs),
            showCancelButton: true,
            confirmButtonText: 'Guardar',
            cancelButtonText: 'Cancelar',
            didOpen: function () {
                ['c5m_hu1', 'c5m_hu2', 'c5m_hu3', 'c5m_hu4'].forEach(function (id) {
                    c5SetSwalInputBloqueado(document.getElementById(id), true);
                });
            },
            preConfirm: function () {
                const val = [document.getElementById('c5m_hu0').value, document.getElementById('c5m_hu1').value, document.getElementById('c5m_hu2').value, document.getElementById('c5m_hu3').value, document.getElementById('c5m_hu4').value];
                if (!val.some(function (x) { return String(x || '').trim() !== ''; })) {
                    Swal.showValidationMessage('Debe guardar al menos un dato o pulse Cancelar.');
                    return false;
                }
                const res = validarPackingNumericoOpcional(val);
                if (!res.ok) { Swal.showValidationMessage(res.msg); return false; }
                return { recepcion: val[0], ingreso_gasificado: val[1], salida_gasificado: val[2], ingreso_prefrio: val[3], salida_prefrio: val[4] };
            }
        }).then(function (r) { if (r.isConfirmed && r.value) { datosC5.packing4_c5[index] = r.value; renderAllPackingRows(); persistPackingSiThermoking(); } });
    }
    function editarFilaC5Packing5(index, dataActual) {
        const labels = ['Recep.', 'In Gas.', 'Out Gas.', 'In Pre.', 'Out Pre.'];
        const v = [dataActual.recepcion, dataActual.ingreso_gasificado, dataActual.salida_gasificado, dataActual.ingreso_prefrio, dataActual.salida_prefrio];
        const inputs = [0, 1, 2, 3, 4].map(function (i) { return '<input type="number" step="0.001" min="0" id="c5m_pa' + i + '" class="swal2-input" value="' + (v[i] ?? '') + '">'; });
        var numFila = index + 1;
        Swal.fire({
            title: 'C5 — Editar Presión ambiente — Fila #' + numFila,
            customClass: { popup: 'packing-edit-modal' },
            html: modalGrid(labels, inputs),
            showCancelButton: true,
            confirmButtonText: 'Guardar',
            cancelButtonText: 'Cancelar',
            didOpen: function () {
                ['c5m_pa1', 'c5m_pa2', 'c5m_pa3', 'c5m_pa4'].forEach(function (id) {
                    c5SetSwalInputBloqueado(document.getElementById(id), true);
                });
            },
            preConfirm: function () {
                const val = [document.getElementById('c5m_pa0').value, document.getElementById('c5m_pa1').value, document.getElementById('c5m_pa2').value, document.getElementById('c5m_pa3').value, document.getElementById('c5m_pa4').value];
                if (!val.some(function (x) { return String(x || '').trim() !== ''; })) {
                    Swal.showValidationMessage('Debe guardar al menos un dato o pulse Cancelar.');
                    return false;
                }
                const res = validarPackingNumericoOpcional(val);
                if (!res.ok) { Swal.showValidationMessage(res.msg); return false; }
                return { recepcion: val[0], ingreso_gasificado: val[1], salida_gasificado: val[2], ingreso_prefrio: val[3], salida_prefrio: val[4] };
            }
        }).then(function (r) { if (r.isConfirmed && r.value) { datosC5.packing5_c5[index] = r.value; renderAllPackingRows(); persistPackingSiThermoking(); } });
    }
    function editarFilaC5Packing6(index, dataActual) {
        const labels = ['Recep.', 'In Gas.', 'Out Gas.', 'In Pre.', 'Out Pre.'];
        const v = [dataActual.recepcion, dataActual.ingreso_gasificado, dataActual.salida_gasificado, dataActual.ingreso_prefrio, dataActual.salida_prefrio];
        const inputs = [0, 1, 2, 3, 4].map(function (i) { return '<input type="number" step="0.001" min="0" id="c5m_pf' + i + '" class="swal2-input" value="' + (v[i] ?? '') + '">'; });
        var numFila = index + 1;
        Swal.fire({
            title: 'C5 — Editar Presión fruta — Fila #' + numFila,
            customClass: { popup: 'packing-edit-modal' },
            html: modalGrid(labels, inputs),
            showCancelButton: true,
            confirmButtonText: 'Guardar',
            cancelButtonText: 'Cancelar',
            didOpen: function () {
                ['c5m_pf1', 'c5m_pf2', 'c5m_pf3', 'c5m_pf4'].forEach(function (id) {
                    c5SetSwalInputBloqueado(document.getElementById(id), true);
                });
            },
            preConfirm: function () {
                const val = [document.getElementById('c5m_pf0').value, document.getElementById('c5m_pf1').value, document.getElementById('c5m_pf2').value, document.getElementById('c5m_pf3').value, document.getElementById('c5m_pf4').value];
                if (!val.some(function (x) { return String(x || '').trim() !== ''; })) {
                    Swal.showValidationMessage('Debe guardar al menos un dato o pulse Cancelar.');
                    return false;
                }
                const res = validarPackingNumericoOpcional(val);
                if (!res.ok) { Swal.showValidationMessage(res.msg); return false; }
                return { recepcion: val[0], ingreso_gasificado: val[1], salida_gasificado: val[2], ingreso_prefrio: val[3], salida_prefrio: val[4] };
            }
        }).then(function (r) { if (r.isConfirmed && r.value) { datosC5.packing6_c5[index] = r.value; renderAllPackingRows(); persistPackingSiThermoking(); } });
    }
    function editarFilaC5Packing8(index, dataActual) {
        var numFila = index + 1;
        Swal.fire({
            title: 'C5 — Editar Observación — Fila #' + numFila,
            customClass: { popup: 'packing-edit-modal' },
            input: 'text',
            inputValue: (dataActual.observacion || '').toString(),
            showCancelButton: true,
            confirmButtonText: 'Guardar',
            cancelButtonText: 'Cancelar',
            inputValidator: function (value) {
                if (!String(value || '').trim()) return 'Debe escribir algo o pulse Cancelar.';
                return null;
            }
        }).then(function (r) { if (r.isConfirmed && r.value !== undefined) { datosC5.packing8_c5[index] = { observacion: r.value }; renderAllPackingRows(); persistPackingSiThermoking(); } });
    }

    /** Devuelve { ok: true } o { ok: false, msg } si no hay fecha/ensayo seleccionados. Impide agregar filas de packing sin contexto. */
    function requiereFechaYEnsayoPacking() {
        const fechaEl = document.getElementById('view_fecha');
        const ensayoEl = document.getElementById('view_ensayo_numero');
        const fecha = (fechaEl && fechaEl.value) ? fechaEl.value.trim() : '';
        const ensayo = (ensayoEl && ensayoEl.value) ? String(ensayoEl.value).trim() : '';
        if (!fecha) return { ok: false, msg: 'Elige primero una fecha en la sección Packing.' };
        if (!ensayo) return { ok: false, msg: 'Elige primero un ensayo en la sección Packing.' };
        return { ok: true };
    }

    // Agregar fila solo en esa sección; Replicar (en Pesos u otras) iguala todo a packing2 y copia última fila.
    const btnAddPacking1 = document.getElementById('btn-add-packing');
    if (btnAddPacking1) btnAddPacking1.addEventListener('click', () => {
        const req = requiereFechaYEnsayoPacking();
        if (!req.ok) { Swal.fire({ title: 'Faltan datos', text: req.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        if (!canAgregarFilaPacking('packing1')) return;
        const recepcion = (document.getElementById('reg_packing_recepcion') && document.getElementById('reg_packing_recepcion').value) || '';
        const ingreso_gasificado = (document.getElementById('reg_packing_ingreso_gasificado') && document.getElementById('reg_packing_ingreso_gasificado').value) || '';
        const salida_gasificado = (document.getElementById('reg_packing_salida_gasificado') && document.getElementById('reg_packing_salida_gasificado').value) || '';
        const ingreso_prefrio = (document.getElementById('reg_packing_ingreso_prefrio') && document.getElementById('reg_packing_ingreso_prefrio').value) || '';
        const salida_prefrio = (document.getElementById('reg_packing_salida_prefrio') && document.getElementById('reg_packing_salida_prefrio').value) || '';
        if (!recepcion.trim()) { Swal.fire({ title: 'Agregar fila', text: 'Complete al menos el primer campo (Recep.) para agregar la fila.', icon: 'info', confirmButtonColor: '#2f7cc0' }); return; }
        const data = { recepcion, ingreso_gasificado, salida_gasificado, ingreso_prefrio, salida_prefrio };
        var resTiempos = validarPacking1TiemposOpcional(data);
        if (resTiempos.warnOrden) {
            Swal.fire({
                title: 'Validación',
                html: '<p><strong>Orden de tiempos:</strong> ' + resTiempos.warnOrden + ' Corrige la fila antes de registrarla.</p>',
                icon: 'warning',
                confirmButtonColor: '#2f7cc0'
            });
            return;
        }
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
        const req = requiereFechaYEnsayoPacking();
        if (!req.ok) { Swal.fire({ title: 'Faltan datos', text: req.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        if (!canAgregarFilaPacking('packing2')) return;
        const peso_recepcion = (document.getElementById('reg_packing_peso_recepcion') && document.getElementById('reg_packing_peso_recepcion').value) || '';
        const peso_ingreso_gasificado = (document.getElementById('reg_packing_peso_ingreso_gasificado') && document.getElementById('reg_packing_peso_ingreso_gasificado').value) || '';
        const peso_salida_gasificado = (document.getElementById('reg_packing_peso_salida_gasificado') && document.getElementById('reg_packing_peso_salida_gasificado').value) || '';
        const peso_ingreso_prefrio = (document.getElementById('reg_packing_peso_ingreso_prefrio') && document.getElementById('reg_packing_peso_ingreso_prefrio').value) || '';
        const peso_salida_prefrio = (document.getElementById('reg_packing_peso_salida_prefrio') && document.getElementById('reg_packing_peso_salida_prefrio').value) || '';
        if (!String(peso_recepcion || '').trim()) { Swal.fire({ title: 'Agregar fila', text: 'Complete al menos el primer campo (Peso Recep.) para agregar la fila.', icon: 'info', confirmButtonColor: '#2f7cc0' }); return; }
        var indexFila = datosPacking.packing2.length;
        var maxRecepcion = getMaxPesoRecepcionPacking(indexFila);
        var avisoPesoVsDespacho = false;
        if (maxRecepcion != null) {
            var prNum = parseFloat(String(peso_recepcion).replace(',', '.'));
            if (!isNaN(prNum) && prNum > maxRecepcion) avisoPesoVsDespacho = true;
        }
        const data = { peso_recepcion, peso_ingreso_gasificado, peso_salida_gasificado, peso_ingreso_prefrio, peso_salida_prefrio };
        var resCadena = validarPacking2PesosOpcional(data);
        if (!resCadena.ok) {
            Swal.fire({ title: 'Validación', text: resCadena.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' });
            return;
        }
        if (resCadena.warnOrden) {
            Swal.fire({ title: 'Validación', text: resCadena.warnOrden, icon: 'warning', confirmButtonColor: '#2f7cc0' });
            return;
        }
        if (avisoPesoVsDespacho && maxRecepcion != null) {
            Swal.fire({
                title: 'Validación',
                text: 'Peso Recepción supera el Despacho Acopio (máx. ' + maxRecepcion + '). Corrige el valor antes de registrar la fila.',
                icon: 'warning',
                confirmButtonColor: '#2f7cc0'
            });
            return;
        }
        datosPacking.packing2.push(data);
        const tbody = document.getElementById('tbody-packing-pesos');
        if (tbody) agregarFilaPacking2(data, tbody, datosPacking.packing2.length);
        actualizarContadorPacking('next_clam_pesos', datosPacking.packing2.length);
        ['reg_packing_peso_recepcion','reg_packing_peso_ingreso_gasificado','reg_packing_peso_salida_gasificado','reg_packing_peso_ingreso_prefrio','reg_packing_peso_salida_prefrio'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    });

    // Al salir del campo Peso Recepción: avisar si se pasó del máximo (Despacho Acopio). Sin refocus para que el OK cierre bien.
    var elPesoRecepcion = document.getElementById('reg_packing_peso_recepcion');
    if (elPesoRecepcion) {
        elPesoRecepcion.addEventListener('blur', function () {
            var indexFila = datosPacking.packing2.length;
            var maxRecepcion = getMaxPesoRecepcionPacking(indexFila);
            if (maxRecepcion == null) return;
            var val = (this.value || '').trim();
            if (!val) return;
            var prNum = parseFloat(String(val).replace(',', '.'));
            if (isNaN(prNum) || prNum <= maxRecepcion) return;
            Swal.fire({ title: 'Aviso — pesos', text: 'Peso Recepción supera el Despacho Acopio (máx. ' + maxRecepcion + '). No se registrará la fila hasta corregir el valor.', icon: 'warning', confirmButtonColor: '#2f7cc0', allowOutsideClick: true });
        });
    }

    const btnAddPacking3 = document.getElementById('btn-add-temp');
    if (btnAddPacking3) btnAddPacking3.addEventListener('click', () => {
        const req = requiereFechaYEnsayoPacking();
        if (!req.ok) { Swal.fire({ title: 'Faltan datos', text: req.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        if (!canAgregarFilaPacking('packing3')) return;
        const get = id => (document.getElementById(id) && document.getElementById(id).value) || '';
        const firstVal = get('reg_packing_temp_amb_recepcion').trim();
        if (!firstVal) { Swal.fire({ title: 'Agregar fila', text: 'Complete al menos el primer campo (T° Amb. Recep.) para agregar la fila.', icon: 'info', confirmButtonColor: '#2f7cc0' }); return; }
        const n = parseFloat(firstVal.replace(',', '.'));
        if (isNaN(n) || n < 0) { Swal.fire({ title: 'Validación', text: 'El valor debe ser un número mayor o igual a 0.', icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        const vals = [get('reg_packing_temp_amb_recepcion'), get('reg_packing_temp_pulp_recepcion'), get('reg_packing_temp_amb_ingreso_gas'), get('reg_packing_temp_pulp_ingreso_gas'), get('reg_packing_temp_amb_salida_gas'), get('reg_packing_temp_pulp_salida_gas'), get('reg_packing_temp_amb_ingreso_pre'), get('reg_packing_temp_pulp_ingreso_pre'), get('reg_packing_temp_amb_salida_pre'), get('reg_packing_temp_pulp_salida_pre')];
        const res3 = validarPackingNumericoOpcional(vals);
        if (!res3.ok) { Swal.fire({ title: 'Validación', text: res3.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        const data = { t_amb_recep: vals[0], t_pulp_recep: vals[1], t_amb_ing: vals[2], t_pulp_ing: vals[3], t_amb_sal: vals[4], t_pulp_sal: vals[5], t_amb_pre_in: vals[6], t_pulp_pre_in: vals[7], t_amb_pre_out: vals[8], t_pulp_pre_out: vals[9] };
        datosPacking.packing3.push(data);
        const tbody = document.getElementById('tbody-packing-temp');
        if (tbody) agregarFilaPacking3(data, tbody, datosPacking.packing3.length);
        actualizarContadorPacking('next_clam_packing_temp', datosPacking.packing3.length);
        ['reg_packing_temp_amb_recepcion','reg_packing_temp_pulp_recepcion','reg_packing_temp_amb_ingreso_gas','reg_packing_temp_pulp_ingreso_gas','reg_packing_temp_amb_salida_gas','reg_packing_temp_pulp_salida_gas','reg_packing_temp_amb_ingreso_pre','reg_packing_temp_pulp_ingreso_pre','reg_packing_temp_amb_salida_pre','reg_packing_temp_pulp_salida_pre'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    });

    var REG_TK_TIEMPOS_IDS = ['ingreso_camaraMP_tiempos_thermoking', 'salida_camaraMP_tiempos_thermoking', 'inicio_traslado_tiempos_thermoking', 'despacho_tiempos_thermoking'];
    var REG_TK_PESO_IDS = ['ingreso_camaraMP_peso_thermoking', 'salida_camaraMP_peso_thermoking', 'inicio_traslado_peso_thermoking', 'despacho_peso_thermoking'];
    var REG_TK_HUMEDAD_IDS = ['ingreso_camaraMP_humedad_thermoking', 'salida_traslado_humedad_thermoking', 'ambienteExt_inicio_humedad_thermoking', 'interior_vehiculo_inicio_thermoking', 'ambienteExt_despacho_thermoking', 'interior_vehiculo_despacho_thermoking'];
    var REG_TK_PRESION_IDS = ['ingreso_camaraMP_presion_thermoking', 'salida_traslado_presion_thermoking', 'ambienteExt_inicio_presion_thermoking', 'interior_vehiculo_inicio_presion_thermoking', 'ambienteExt_despacho_presion_thermoking', 'interior_vehiculo_despacho_presion_thermoking'];
    var REG_TK_VAPOR_IDS = ['ingreso_camaraMP_vapor_thermoking', 'salida_camaraMP_vapor_thermoking', 'inicio_traslado_vapor_thermoking', 'salida_traslado_vapor_thermoking'];
    var REG_TK_CAMARA_MP_IDS = [
        'ingreso_camaraMP_tiempos_thermoking', 'salida_camaraMP_tiempos_thermoking',
        'ingreso_camaraMP_peso_thermoking', 'salida_camaraMP_peso_thermoking',
        'reg_tk_temp_ic_cm', 'reg_tk_temp_ic_pu', 'reg_tk_temp_st_cm', 'reg_tk_temp_st_pu',
        'ingreso_camaraMP_humedad_thermoking', 'salida_traslado_humedad_thermoking',
        'ingreso_camaraMP_presion_thermoking', 'salida_traslado_presion_thermoking',
        'ingreso_camaraMP_vapor_thermoking', 'salida_camaraMP_vapor_thermoking'
    ];

    function applyThermokingCamaraMpModeUI() {
        var usar = thermokingUsarCamaraMP !== false;
        REG_TK_CAMARA_MP_IDS.forEach(function (id) {
            var el = document.getElementById(id);
            if (!el) return;
            el.disabled = !usar;
            el.classList.toggle('thermoking-input-cam-mp-disabled', !usar);
            if (!usar) el.value = '';
        });
    }

    /** Vacía inputs cámara MP en el modal (los disabled no siempre limpian bien el valor en todos los navegadores). */
    function vaciarInputsModalCamMp_(ids) {
        ids.forEach(function (id) {
            var el = document.getElementById(id);
            if (!el) return;
            el.disabled = false;
            el.classList.remove('thermoking-input-cam-mp-disabled');
            el.value = '';
            try { el.removeAttribute('value'); } catch (e) {}
        });
    }

    /** Al bloquear cámara MP: vacía ic/st (y equivalentes) en todas las secciones Thermo King de esa fila. */
    function vaciarCamCamaraMPEnFilaThermoking(index) {
        if (typeof index !== 'number' || index < 0) return;
        var t = datosThermokingTiempos && datosThermokingTiempos[index];
        if (t) { t.ic = ''; t.st = ''; }
        var p = datosThermokingPesoTk && datosThermokingPesoTk[index];
        if (p) { p.ic = ''; p.st = ''; }
        var te = datosThermokingTemp && datosThermokingTemp[index];
        if (te) { te.ic_cm = ''; te.ic_pu = ''; te.st_cm = ''; te.st_pu = ''; }
        var h = datosThermokingHumedadTk && datosThermokingHumedadTk[index];
        if (h) { h.ic = ''; h.st = ''; }
        var pr = datosThermokingPresionTk && datosThermokingPresionTk[index];
        if (pr) { pr.ic = ''; pr.st = ''; }
        var v = datosThermokingVapor && datosThermokingVapor[index];
        if (v) { v.ic = ''; v.scm = ''; }
    }

    /** Candado a la derecha de cada input cámara MP: alternar bloquear / desbloquear con confirmación. */
    function wireThermokingModalCamaraMpInlineLocks(inputIds, options) {
        options = options || {};
        var onAfterRefresh = options.onAfterRefresh;
        var rowIndexThermoking = options.rowIndex;

        function findLockBtn(id) {
            var p = document.querySelector('.swal2-popup [data-tk-lock-for="' + id + '"]');
            return p || document.querySelector('[data-tk-lock-for="' + id + '"]');
        }

        function refreshLockUi() {
            var locked = thermokingUsarCamaraMP === false;
            inputIds.forEach(function (id) {
                var el = document.getElementById(id);
                if (el) {
                    el.disabled = locked;
                    el.classList.toggle('thermoking-input-cam-mp-disabled', locked);
                }
                var btn = findLockBtn(id);
                if (btn) {
                    var icon = btn.querySelector('i');
                    if (icon) icon.setAttribute('data-lucide', locked ? 'lock' : 'unlock');
                    btn.title = locked ? 'Desbloquear cámara MP' : 'Bloquear cámara MP';
                    btn.setAttribute('aria-pressed', locked ? 'true' : 'false');
                }
            });
            if (window.lucide && lucide.createIcons) lucide.createIcons();
            if (typeof onAfterRefresh === 'function') onAfterRefresh();
        }

        function handleLockClick() {
            var locked = thermokingUsarCamaraMP === false;
            if (locked) {
                Swal.fire({
                    title: 'Cámara de materia prima',
                    text: '¿Va a trabajar con cámara de materia prima?',
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonText: 'Sí',
                    cancelButtonText: 'No',
                    confirmButtonColor: '#2f7cc0',
                    cancelButtonColor: '#6c757d',
                    allowOutsideClick: false,
                    allowEscapeKey: false,
                    allowEnterKey: false
                }).then(function (r) {
                    if (!r.isConfirmed) return;
                    thermokingUsarCamaraMP = true;
                    if (currentFechaPacking && currentEnsayoPacking) guardarPackingEnStore(currentFechaPacking, currentEnsayoPacking);
                    applyThermokingCamaraMpModeUI();
                    renderAllPackingRows();
                    actualizarTodosContadoresPacking();
                    refreshLockUi();
                });
            } else {
                Swal.fire({
                    title: 'Cámara de materia prima',
                    text: '¿Confirmar que no usará cámara de materia prima? Se vaciarán ingreso y salida de cámara MP en este formulario.',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Sí, bloquear',
                    cancelButtonText: 'Cancelar',
                    confirmButtonColor: '#2f7cc0',
                    cancelButtonColor: '#6c757d',
                    allowOutsideClick: false,
                    allowEscapeKey: false,
                    allowEnterKey: false
                }).then(function (r) {
                    if (!r.isConfirmed) return;
                    thermokingUsarCamaraMP = false;
                    vaciarInputsModalCamMp_(inputIds);
                    if (typeof rowIndexThermoking === 'number' && rowIndexThermoking >= 0) {
                        vaciarCamCamaraMPEnFilaThermoking(rowIndexThermoking);
                    }
                    persistPackingSiThermoking();
                    applyThermokingCamaraMpModeUI();
                    renderAllPackingRows();
                    actualizarTodosContadoresPacking();
                    refreshLockUi();
                });
            }
        }

        inputIds.forEach(function (id) {
            var btn = findLockBtn(id);
            if (btn) btn.onclick = function (e) {
                e.preventDefault();
                handleLockClick();
            };
        });
        refreshLockUi();
    }

    /** Solo si peso está totalmente vacío (sin filas guardadas ni ningún valor en la primera fila fija): avisar antes de usar otras secciones Thermo King. */
    function requierePrimeraFilaPesoThermoking() {
        if (datosThermokingPesoTk && datosThermokingPesoTk.length > 0) return { ok: true };
        var vals = REG_TK_PESO_IDS.map(function (id) {
            var el = document.getElementById(id);
            return el ? String(el.value || '').trim() : '';
        });
        if (vals.some(function (v) { return v !== ''; })) return { ok: true };
        return { ok: false, msg: 'Primero complete al menos una fila en «Peso de bruto muestra» (valores en la primera fila). Después podrá usar Tiempos, temperatura, humedad, etc.' };
    }

    var REG_TK_TEMP_IDS = ['reg_tk_temp_ic_cm', 'reg_tk_temp_ic_pu', 'reg_tk_temp_st_cm', 'reg_tk_temp_st_pu', 'reg_tk_temp_it_amb', 'reg_tk_temp_it_veh', 'reg_tk_temp_it_pu', 'reg_tk_temp_d_amb', 'reg_tk_temp_d_veh', 'reg_tk_temp_d_pu'];
    var btnAddTkTemp = document.getElementById('btn-add-tk-temp');
    if (btnAddTkTemp) btnAddTkTemp.addEventListener('click', function () {
        var req = requiereFechaYEnsayoPacking();
        if (!req.ok) { Swal.fire({ title: 'Faltan datos', text: req.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        var rp = requierePrimeraFilaPesoThermoking();
        if (!rp.ok) { Swal.fire({ title: 'Primero: peso bruto', text: rp.msg, icon: 'info', confirmButtonColor: '#2f7cc0' }); return; }
        var get = function (id) { var el = document.getElementById(id); return el && el.value ? el.value : ''; };
        var vals = REG_TK_TEMP_IDS.map(get);
        var algunoLleno = vals.some(function (v) { return String(v || '').trim() !== ''; });
        if (!algunoLleno) { Swal.fire({ title: 'Agregar fila', text: 'Ingrese al menos un valor de temperatura para agregar la fila.', icon: 'info', confirmButtonColor: '#2f7cc0' }); return; }
        var resTk = validarPackingNumericoOpcional(vals);
        if (!resTk.ok) { Swal.fire({ title: 'Validación', text: resTk.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        var data = {
            ic_cm: thermokingUsarCamaraMP === false ? '' : vals[0],
            ic_pu: thermokingUsarCamaraMP === false ? '' : vals[1],
            st_cm: thermokingUsarCamaraMP === false ? '' : vals[2],
            st_pu: thermokingUsarCamaraMP === false ? '' : vals[3],
            it_amb: vals[4], it_veh: vals[5], it_pu: vals[6], d_amb: vals[7], d_veh: vals[8], d_pu: vals[9]
        };
        datosThermokingTemp.push(data);
        var tbodyTk = document.getElementById('tbody-thermoking-temp');
        if (tbodyTk) agregarFilaThermokingTemp(data, tbodyTk, datosThermokingTemp.length);
        actualizarTodosContadoresPacking();
        REG_TK_TEMP_IDS.forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
        persistPackingSiThermoking();
    });

    var btnAddThermokingObs = document.getElementById('btn-add-thermoking-obs');
    if (btnAddThermokingObs) btnAddThermokingObs.addEventListener('click', function () {
        var req = requiereFechaYEnsayoPacking();
        if (!req.ok) { Swal.fire({ title: 'Faltan datos', text: req.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        var rp = requierePrimeraFilaPesoThermoking();
        if (!rp.ok) { Swal.fire({ title: 'Primero: peso bruto', text: rp.msg, icon: 'info', confirmButtonColor: '#2f7cc0' }); return; }
        var observacion = (document.getElementById('reg_thermoking_obs_texto') && document.getElementById('reg_thermoking_obs_texto').value) || '';
        datosThermokingObs.push({ observacion: observacion });
        var tbodyObs = document.getElementById('tbody-thermoking-obs');
        if (tbodyObs) agregarFilaThermokingObs({ observacion: observacion }, tbodyObs, datosThermokingObs.length);
        actualizarTodosContadoresPacking();
        var elObs = document.getElementById('reg_thermoking_obs_texto');
        if (elObs) elObs.value = '';
        persistPackingSiThermoking();
    });

    var btnAddTkTiempos = document.getElementById('btn-add-thermoking-tiempos');
    if (btnAddTkTiempos) btnAddTkTiempos.addEventListener('click', async function () {
        var req = requiereFechaYEnsayoPacking();
        if (!req.ok) { Swal.fire({ title: 'Faltan datos', text: req.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        var rp = requierePrimeraFilaPesoThermoking();
        if (!rp.ok) { Swal.fire({ title: 'Primero: peso bruto', text: rp.msg, icon: 'info', confirmButtonColor: '#2f7cc0' }); return; }
        var get = function (id) { var el = document.getElementById(id); return el && el.value ? el.value : ''; };
        var vals = REG_TK_TIEMPOS_IDS.map(get);
        var camFilledT = 0;
        if (String(vals[0] || '').trim() !== '') camFilledT++;
        if (String(vals[1] || '').trim() !== '') camFilledT++;
        if (thermokingUsarCamaraMP == null && typeof Swal !== 'undefined') {
            if (camFilledT === 2) {
                thermokingUsarCamaraMP = true;
                applyThermokingCamaraMpModeUI();
                if (currentFechaPacking && currentEnsayoPacking) guardarPackingEnStore(currentFechaPacking, currentEnsayoPacking);
            } else {
                var rCamTi = await Swal.fire({
                    title: 'Camara de materia prima',
                    text: camFilledT === 1
                        ? 'Solo uno de los campos de camara MP tiene dato. Se va a trabajar con camara de materia prima?'
                        : 'No hay datos en camara MP. Se va a trabajar con camara de materia prima?',
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonText: 'Si',
                    cancelButtonText: 'No',
                    confirmButtonColor: '#2f7cc0',
                    cancelButtonColor: '#6c757d',
                    allowOutsideClick: false,
                    allowEscapeKey: false,
                    allowEnterKey: false
                });
                thermokingUsarCamaraMP = !!rCamTi.isConfirmed;
                applyThermokingCamaraMpModeUI();
                if (currentFechaPacking && currentEnsayoPacking) guardarPackingEnStore(currentFechaPacking, currentEnsayoPacking);
                if (thermokingUsarCamaraMP === false) {
                    vals[0] = '';
                    vals[1] = '';
                }
            }
        }
        var algunoLleno = vals.some(function (v) { return String(v || '').trim() !== ''; });
        if (!algunoLleno) { Swal.fire({ title: 'Agregar fila', text: 'Ingrese al menos un valor de tiempos para agregar la fila.', icon: 'info', confirmButtonColor: '#2f7cc0' }); return; }
        var cad = validarThermokingTiempoCadenaCreciente(vals);
        if (!cad.ok) { Swal.fire({ title: 'Orden de tiempos', text: cad.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        var data = {
            ic: thermokingUsarCamaraMP === false ? '' : vals[0],
            st: thermokingUsarCamaraMP === false ? '' : vals[1],
            it: vals[2],
            dp: vals[3]
        };
        datosThermokingTiempos.push(data);
        var tbody = document.getElementById('tbody-thermoking-tiempos');
        if (tbody) agregarFilaThermokingTiempos(data, tbody, datosThermokingTiempos.length);
        actualizarTodosContadoresPacking();
        REG_TK_TIEMPOS_IDS.forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
        persistPackingSiThermoking();
    });

    var btnAddTkPeso = document.getElementById('btn-add-thermoking-peso');
    if (btnAddTkPeso) btnAddTkPeso.addEventListener('click', async function () {
        var req = requiereFechaYEnsayoPacking();
        if (!req.ok) { Swal.fire({ title: 'Faltan datos', text: req.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        var get = function (id) { var el = document.getElementById(id); return el && el.value != null ? String(el.value).trim() : ''; };
        var vals = REG_TK_PESO_IDS.map(get);
        var camFilledP = 0;
        if (String(vals[0] || '').trim() !== '') camFilledP++;
        if (String(vals[1] || '').trim() !== '') camFilledP++;
        if (thermokingUsarCamaraMP == null && typeof Swal !== 'undefined') {
            if (camFilledP === 2) {
                thermokingUsarCamaraMP = true;
                applyThermokingCamaraMpModeUI();
                if (currentFechaPacking && currentEnsayoPacking) guardarPackingEnStore(currentFechaPacking, currentEnsayoPacking);
            } else {
                var rCam = await Swal.fire({
                    title: 'Camara de materia prima',
                    text: camFilledP === 1
                        ? 'Solo uno de los campos de camara MP tiene dato. Se va a trabajar con camara de materia prima?'
                        : 'No hay datos en camara MP. Se va a trabajar con camara de materia prima?',
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonText: 'Si',
                    cancelButtonText: 'No',
                    confirmButtonColor: '#2f7cc0',
                    cancelButtonColor: '#6c757d',
                    allowOutsideClick: false,
                    allowEscapeKey: false,
                    allowEnterKey: false
                });
                thermokingUsarCamaraMP = !!rCam.isConfirmed;
                applyThermokingCamaraMpModeUI();
                if (currentFechaPacking && currentEnsayoPacking) guardarPackingEnStore(currentFechaPacking, currentEnsayoPacking);
                if (thermokingUsarCamaraMP === false) {
                    vals[0] = '';
                    vals[1] = '';
                }
            }
        }
        var algunoLleno = vals.some(function (v) { return String(v || '').trim() !== ''; });
        if (!algunoLleno) {
            Swal.fire({ title: 'Agregar fila', text: 'Ingrese al menos un peso (g) en Ing. cámara MP, Sal. cám. MP, Inic. trasl. T-H o Despacho T-H. Los demás pueden quedar vacíos.', icon: 'info', confirmButtonColor: '#2f7cc0' });
            return;
        }
        var resNum = validarPackingNumericoOpcional(vals);
        if (!resNum.ok) { Swal.fire({ title: 'Validación', text: resNum.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        var resCad = validarThermokingPesoCadenaCreciente(vals, datosThermokingPesoTk.length);
        if (!resCad.ok) { Swal.fire({ title: 'Pesos Thermo King', text: resCad.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        var data = {
            ic: thermokingUsarCamaraMP === false ? '' : vals[0],
            st: thermokingUsarCamaraMP === false ? '' : vals[1],
            it: vals[2],
            dp: vals[3]
        };
        datosThermokingPesoTk.push(data);
        var tbodyPe = document.getElementById('tbody-thermoking-peso');
        if (tbodyPe) agregarFilaThermokingPesoTk(data, tbodyPe, datosThermokingPesoTk.length);
        actualizarTodosContadoresPacking();
        REG_TK_PESO_IDS.forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
        persistPackingSiThermoking();
    });

    (function bindTkPesoLiveValidation() {
        function refreshTkPesoLive() {
            var filaIdx = datosThermokingPesoTk.length;
            var vals = REG_TK_PESO_IDS.map(function (id) {
                var el = document.getElementById(id);
                return el ? el.value : '';
            });
            var res = validarThermokingPesoCadenaCreciente(vals, filaIdx);
            var errEl = document.getElementById('tk_peso_validacion_msg');
            REG_TK_PESO_IDS.forEach(function (id) {
                var el = document.getElementById(id);
                if (el) el.classList.toggle('input-invalid-tk', !res.ok);
            });
            if (errEl) {
                errEl.textContent = res.ok ? '' : res.msg;
                errEl.style.display = res.ok ? 'none' : 'block';
            }
        }
        REG_TK_PESO_IDS.forEach(function (id) {
            var el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', refreshTkPesoLive);
                el.addEventListener('change', refreshTkPesoLive);
            }
        });
        var refSp = document.getElementById('reg_packing_peso_salida_prefrio');
        if (refSp) {
            refSp.addEventListener('input', refreshTkPesoLive);
            refSp.addEventListener('change', refreshTkPesoLive);
        }
    })();

    var btnAddTkHum = document.getElementById('btn-add-thermoking-humedad');
    if (btnAddTkHum) btnAddTkHum.addEventListener('click', function () {
        var req = requiereFechaYEnsayoPacking();
        if (!req.ok) { Swal.fire({ title: 'Faltan datos', text: req.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        var rp = requierePrimeraFilaPesoThermoking();
        if (!rp.ok) { Swal.fire({ title: 'Primero: peso bruto', text: rp.msg, icon: 'info', confirmButtonColor: '#2f7cc0' }); return; }
        var get = function (id) { var el = document.getElementById(id); return el && el.value ? el.value : ''; };
        var vals = REG_TK_HUMEDAD_IDS.map(get);
        var algunoLleno = vals.some(function (v) { return String(v || '').trim() !== ''; });
        if (!algunoLleno) { Swal.fire({ title: 'Agregar fila', text: 'Ingrese al menos un valor de humedad para agregar la fila.', icon: 'info', confirmButtonColor: '#2f7cc0' }); return; }
        var resTk = validarPackingNumericoOpcional(vals);
        if (!resTk.ok) { Swal.fire({ title: 'Validación', text: resTk.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        var data = {
            ic: thermokingUsarCamaraMP === false ? '' : vals[0],
            st: thermokingUsarCamaraMP === false ? '' : vals[1],
            aei: vals[2], ivi: vals[3], aed: vals[4], ivd: vals[5]
        };
        datosThermokingHumedadTk.push(data);
        var tbodyH = document.getElementById('tbody-thermoking-humedad');
        if (tbodyH) agregarFilaThermokingHumedadTk(data, tbodyH, datosThermokingHumedadTk.length);
        actualizarTodosContadoresPacking();
        REG_TK_HUMEDAD_IDS.forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
        persistPackingSiThermoking();
    });

    var btnAddTkPr = document.getElementById('btn-add-thermoking-presion');
    if (btnAddTkPr) btnAddTkPr.addEventListener('click', function () {
        var req = requiereFechaYEnsayoPacking();
        if (!req.ok) { Swal.fire({ title: 'Faltan datos', text: req.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        var rp = requierePrimeraFilaPesoThermoking();
        if (!rp.ok) { Swal.fire({ title: 'Primero: peso bruto', text: rp.msg, icon: 'info', confirmButtonColor: '#2f7cc0' }); return; }
        var get = function (id) { var el = document.getElementById(id); return el && el.value ? el.value : ''; };
        var vals = REG_TK_PRESION_IDS.map(get);
        var algunoLleno = vals.some(function (v) { return String(v || '').trim() !== ''; });
        if (!algunoLleno) { Swal.fire({ title: 'Agregar fila', text: 'Ingrese al menos un valor de presión para agregar la fila.', icon: 'info', confirmButtonColor: '#2f7cc0' }); return; }
        var resTk = validarPackingNumericoOpcional(vals);
        if (!resTk.ok) { Swal.fire({ title: 'Validación', text: resTk.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        var data = {
            ic: thermokingUsarCamaraMP === false ? '' : vals[0],
            st: thermokingUsarCamaraMP === false ? '' : vals[1],
            aei: vals[2], ivi: vals[3], aed: vals[4], ivd: vals[5]
        };
        datosThermokingPresionTk.push(data);
        var tbodyPr = document.getElementById('tbody-thermoking-presion');
        if (tbodyPr) agregarFilaThermokingPresionTk(data, tbodyPr, datosThermokingPresionTk.length);
        actualizarTodosContadoresPacking();
        REG_TK_PRESION_IDS.forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
        persistPackingSiThermoking();
    });

    var btnAddTkVap = document.getElementById('btn-add-thermoking-vapor');
    if (btnAddTkVap) btnAddTkVap.addEventListener('click', function () {
        var req = requiereFechaYEnsayoPacking();
        if (!req.ok) { Swal.fire({ title: 'Faltan datos', text: req.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        var rp = requierePrimeraFilaPesoThermoking();
        if (!rp.ok) { Swal.fire({ title: 'Primero: peso bruto', text: rp.msg, icon: 'info', confirmButtonColor: '#2f7cc0' }); return; }
        var get = function (id) { var el = document.getElementById(id); return el && el.value ? el.value : ''; };
        var vals = REG_TK_VAPOR_IDS.map(get);
        var algunoLleno = vals.some(function (v) { return String(v || '').trim() !== ''; });
        if (!algunoLleno) { Swal.fire({ title: 'Agregar fila', text: 'Ingrese al menos un valor de presión de vapor fruta para agregar la fila.', icon: 'info', confirmButtonColor: '#2f7cc0' }); return; }
        var resTk = validarPackingNumericoOpcional(vals);
        if (!resTk.ok) { Swal.fire({ title: 'Validación', text: resTk.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        var data = {
            ic: thermokingUsarCamaraMP === false ? '' : vals[0],
            scm: thermokingUsarCamaraMP === false ? '' : vals[1],
            it: vals[2],
            st: vals[3]
        };
        datosThermokingVapor.push(data);
        var tbodyV = document.getElementById('tbody-thermoking-vapor');
        if (tbodyV) agregarFilaThermokingVapor(data, tbodyV, datosThermokingVapor.length);
        actualizarTodosContadoresPacking();
        REG_TK_VAPOR_IDS.forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
        persistPackingSiThermoking();
    });

    const btnAddPacking4 = document.getElementById('btn-add-packing-humedad');
    if (btnAddPacking4) btnAddPacking4.addEventListener('click', () => {
        const req = requiereFechaYEnsayoPacking();
        if (!req.ok) { Swal.fire({ title: 'Faltan datos', text: req.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        if (!canAgregarFilaPacking('packing4')) return;
        const get = id => (document.getElementById(id) && document.getElementById(id).value) || '';
        const firstVal = get('reg_packing_humedad_recepcion').trim();
        if (!firstVal) { Swal.fire({ title: 'Agregar fila', text: 'Complete al menos el primer campo (Humedad Recep.) para agregar la fila.', icon: 'info', confirmButtonColor: '#2f7cc0' }); return; }
        const n = parseFloat(firstVal.replace(',', '.'));
        if (isNaN(n) || n < 0) { Swal.fire({ title: 'Validación', text: 'El valor debe ser un número mayor o igual a 0.', icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        const vals = [get('reg_packing_humedad_recepcion'), get('reg_packing_humedad_ingreso_gasificado'), get('reg_packing_humedad_salida_gasificado'), get('reg_packing_humedad_ingreso_prefrio'), get('reg_packing_humedad_salida_prefrio')];
        const res4 = validarPackingNumericoOpcional(vals);
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
        const req = requiereFechaYEnsayoPacking();
        if (!req.ok) { Swal.fire({ title: 'Faltan datos', text: req.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        if (!canAgregarFilaPacking('packing5')) return;
        const get = id => (document.getElementById(id) && document.getElementById(id).value) || '';
        const firstVal = get('reg_packing_presion_recepcion').trim();
        if (!firstVal) { Swal.fire({ title: 'Agregar fila', text: 'Complete al menos el primer campo (Presión Recep.) para agregar la fila.', icon: 'info', confirmButtonColor: '#2f7cc0' }); return; }
        const n = parseFloat(firstVal.replace(',', '.'));
        if (isNaN(n) || n < 0) { Swal.fire({ title: 'Validación', text: 'El valor debe ser un número mayor o igual a 0.', icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        const vals = [get('reg_packing_presion_recepcion'), get('reg_packing_presion_ingreso_gasificado'), get('reg_packing_presion_salida_gasificado'), get('reg_packing_presion_ingreso_prefrio'), get('reg_packing_presion_salida_prefrio')];
        const res5 = validarPackingNumericoOpcional(vals);
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
        const req = requiereFechaYEnsayoPacking();
        if (!req.ok) { Swal.fire({ title: 'Faltan datos', text: req.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        if (!canAgregarFilaPacking('packing6')) return;
        const get = id => (document.getElementById(id) && document.getElementById(id).value) || '';
        const firstVal = get('reg_packing_presion_fruta_recepcion').trim();
        if (!firstVal) { Swal.fire({ title: 'Agregar fila', text: 'Complete al menos el primer campo (Presión fruta Recep.) para agregar la fila.', icon: 'info', confirmButtonColor: '#2f7cc0' }); return; }
        const n = parseFloat(firstVal.replace(',', '.'));
        if (isNaN(n) || n < 0) { Swal.fire({ title: 'Validación', text: 'El valor debe ser un número mayor o igual a 0.', icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        const vals = [get('reg_packing_presion_fruta_recepcion'), get('reg_packing_presion_fruta_ingreso_gasificado'), get('reg_packing_presion_fruta_salida_gasificado'), get('reg_packing_presion_fruta_ingreso_prefrio'), get('reg_packing_presion_fruta_salida_prefrio')];
        const res6 = validarPackingNumericoOpcional(vals);
        if (!res6.ok) { Swal.fire({ title: 'Validación', text: res6.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        const data = { recepcion: vals[0], ingreso_gasificado: vals[1], salida_gasificado: vals[2], ingreso_prefrio: vals[3], salida_prefrio: vals[4] };
        datosPacking.packing6.push(data);
        const tbody = document.getElementById('tbody-packing-presion-fruta');
        if (tbody) agregarFilaPacking6(data, tbody, datosPacking.packing6.length);
        actualizarContadorPacking('next_clam_packing_presion_fruta', datosPacking.packing6.length);
        ['reg_packing_presion_fruta_recepcion','reg_packing_presion_fruta_ingreso_gasificado','reg_packing_presion_fruta_salida_gasificado','reg_packing_presion_fruta_ingreso_prefrio','reg_packing_presion_fruta_salida_prefrio'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    });

    const btnAddPacking8 = document.getElementById('btn-add-packing-obs');
    if (btnAddPacking8) btnAddPacking8.addEventListener('click', () => {
        const req = requiereFechaYEnsayoPacking();
        if (!req.ok) { Swal.fire({ title: 'Faltan datos', text: req.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        if (!canAgregarFilaPacking('packing8')) return;
        const observacion = (document.getElementById('reg_packing_obs_texto') && document.getElementById('reg_packing_obs_texto').value) || '';
        datosPacking.packing8.push({ observacion });
        const tbody = document.getElementById('tbody-packing-obs');
        if (tbody) agregarFilaPacking8({ observacion }, tbody, datosPacking.packing8.length);
        actualizarContadorPacking('next_clam_packing_obs', datosPacking.packing8.length);
        if (document.getElementById('reg_packing_obs_texto')) document.getElementById('reg_packing_obs_texto').value = '';
    });

    const btnAddC5Packing1 = document.getElementById('btn-add-packing_c5');
    if (btnAddC5Packing1) btnAddC5Packing1.addEventListener('click', function () {
        const req = requiereFechaYEnsayoPacking();
        if (!req.ok) { Swal.fire({ title: 'Faltan datos', text: req.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        if (!canAgregarFilaC5('packing1_c5')) return;
        const recepcion = (document.getElementById('reg_packing_recepcion_c5') && document.getElementById('reg_packing_recepcion_c5').value) || '';
        const ingreso_gasificado = (document.getElementById('reg_packing_ingreso_gasificado_c5') && document.getElementById('reg_packing_ingreso_gasificado_c5').value) || '';
        const salida_gasificado = (document.getElementById('reg_packing_salida_gasificado_c5') && document.getElementById('reg_packing_salida_gasificado_c5').value) || '';
        const ingreso_prefrio = (document.getElementById('reg_packing_ingreso_prefrio_c5') && document.getElementById('reg_packing_ingreso_prefrio_c5').value) || '';
        const salida_prefrio = (document.getElementById('reg_packing_salida_prefrio_c5') && document.getElementById('reg_packing_salida_prefrio_c5').value) || '';
        if (!recepcion.trim()) { Swal.fire({ title: 'Agregar fila', text: 'Complete al menos el primer campo (Recep.) para agregar la fila.', icon: 'info', confirmButtonColor: '#2f7cc0' }); return; }
        const data = { recepcion: recepcion, ingreso_gasificado: ingreso_gasificado, salida_gasificado: salida_gasificado, ingreso_prefrio: ingreso_prefrio, salida_prefrio: salida_prefrio };
        var resTiempos = validarPacking1TiemposOpcional(data);
        if (resTiempos.warnOrden) {
            Swal.fire({
                title: 'Validación',
                html: '<p><strong>Orden de tiempos:</strong> ' + resTiempos.warnOrden + ' Corrige la fila antes de registrarla.</p>',
                icon: 'warning',
                confirmButtonColor: '#2f7cc0'
            });
            return;
        }
        datosC5.packing1_c5.push(data);
        const tbody = document.getElementById('tbody-packing-1_c5');
        if (tbody) agregarFilaC5Packing1(data, tbody, datosC5.packing1_c5.length);
        actualizarContadorPacking('next_clam_packing_c5', datosC5.packing1_c5.length);
        ['reg_packing_recepcion_c5', 'reg_packing_ingreso_gasificado_c5', 'reg_packing_salida_gasificado_c5', 'reg_packing_ingreso_prefrio_c5', 'reg_packing_salida_prefrio_c5'].forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
        persistPackingSiThermoking();
        scheduleThermokingProgressRefresh();
    });

    const btnAddC5Packing2 = document.getElementById('btn-add-pesos_c5');
    if (btnAddC5Packing2) btnAddC5Packing2.addEventListener('click', function () {
        const req = requiereFechaYEnsayoPacking();
        if (!req.ok) { Swal.fire({ title: 'Faltan datos', text: req.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        if (!canAgregarFilaC5('packing2_c5')) return;
        const peso_recepcion = (document.getElementById('reg_packing_peso_recepcion_c5') && document.getElementById('reg_packing_peso_recepcion_c5').value) || '';
        const peso_ingreso_gasificado = (document.getElementById('reg_packing_peso_ingreso_gasificado_c5') && document.getElementById('reg_packing_peso_ingreso_gasificado_c5').value) || '';
        const peso_salida_gasificado = (document.getElementById('reg_packing_peso_salida_gasificado_c5') && document.getElementById('reg_packing_peso_salida_gasificado_c5').value) || '';
        const peso_ingreso_prefrio = (document.getElementById('reg_packing_peso_ingreso_prefrio_c5') && document.getElementById('reg_packing_peso_ingreso_prefrio_c5').value) || '';
        const peso_salida_prefrio = (document.getElementById('reg_packing_peso_salida_prefrio_c5') && document.getElementById('reg_packing_peso_salida_prefrio_c5').value) || '';
        if (!String(peso_recepcion || '').trim()) { Swal.fire({ title: 'Agregar fila', text: 'Complete al menos el primer campo (Peso Recep.) para agregar la fila.', icon: 'info', confirmButtonColor: '#2f7cc0' }); return; }
        var indexFila = datosC5.packing2_c5.length;
        var maxRecepcion = getMaxPesoRecepcionPacking(indexFila);
        var avisoPesoVsDespachoC5 = false;
        if (maxRecepcion != null) {
            var prNumC5 = parseFloat(String(peso_recepcion).replace(',', '.'));
            if (!isNaN(prNumC5) && prNumC5 > maxRecepcion) avisoPesoVsDespachoC5 = true;
        }
        const data = { peso_recepcion: peso_recepcion, peso_ingreso_gasificado: peso_ingreso_gasificado, peso_salida_gasificado: peso_salida_gasificado, peso_ingreso_prefrio: peso_ingreso_prefrio, peso_salida_prefrio: peso_salida_prefrio };
        var resCadena = validarPacking2PesosOpcional(data);
        if (!resCadena.ok) { Swal.fire({ title: 'Validación', text: resCadena.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        if (resCadena.warnOrden) { Swal.fire({ title: 'Validación', text: resCadena.warnOrden, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        if (avisoPesoVsDespachoC5 && maxRecepcion != null) {
            Swal.fire({
                title: 'Validación',
                text: 'Peso Recepción supera el Despacho Acopio (máx. ' + maxRecepcion + '). Corrige el valor antes de registrar la fila.',
                icon: 'warning',
                confirmButtonColor: '#2f7cc0'
            });
            return;
        }
        datosC5.packing2_c5.push(data);
        const tbody = document.getElementById('tbody-packing-pesos_c5');
        if (tbody) agregarFilaC5Packing2(data, tbody, datosC5.packing2_c5.length);
        actualizarContadorPacking('next_clam_pesos_c5', datosC5.packing2_c5.length);
        REG_C5_PESO_IDS.forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
        persistPackingSiThermoking();
        scheduleThermokingProgressRefresh();
        try { applyRecepcionC5TemplatePrimerInputLock(); } catch (eC5p2) {}
    });

    var elPesoRecepcionC5 = document.getElementById('reg_packing_peso_recepcion_c5');
    if (elPesoRecepcionC5) {
        elPesoRecepcionC5.addEventListener('blur', function () {
            var indexFila = datosC5.packing2_c5.length;
            var maxRecepcion = getMaxPesoRecepcionPacking(indexFila);
            if (maxRecepcion == null) return;
            var val = (this.value || '').trim();
            if (!val) return;
            var prNum = parseFloat(String(val).replace(',', '.'));
            if (isNaN(prNum) || prNum <= maxRecepcion) return;
            Swal.fire({ title: 'Aviso — pesos', text: 'Peso Recepción supera el Despacho Acopio (máx. ' + maxRecepcion + '). Puedes seguir editando; revisa si el valor es correcto.', icon: 'warning', confirmButtonColor: '#2f7cc0', allowOutsideClick: true });
        });
    }

    const btnAddC5Packing3 = document.getElementById('btn-add-temp_c5');
    if (btnAddC5Packing3) btnAddC5Packing3.addEventListener('click', function () {
        const req = requiereFechaYEnsayoPacking();
        if (!req.ok) { Swal.fire({ title: 'Faltan datos', text: req.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        if (!canAgregarFilaC5('packing3_c5')) return;
        var rp = requierePrimeraFilaPesoC5();
        if (!rp.ok) { Swal.fire({ title: 'Primero: peso C5', text: rp.msg, icon: 'info', confirmButtonColor: '#2f7cc0' }); return; }
        var get = function (id) { var el = document.getElementById(id); return el && el.value ? el.value : ''; };
        var vals = REG_C5_TEMP_IDS.map(get);
        if (!vals.some(function (v) { return String(v || '').trim() !== ''; })) { Swal.fire({ title: 'Agregar fila', text: 'Complete al menos un valor de temperatura para agregar la fila.', icon: 'info', confirmButtonColor: '#2f7cc0' }); return; }
        var res3 = validarPackingNumericoOpcional(vals);
        if (!res3.ok) { Swal.fire({ title: 'Validación', text: res3.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        const data = { t_amb_recep: vals[0], t_pulp_recep: vals[1], t_amb_ing: vals[2], t_pulp_ing: vals[3], t_amb_sal: vals[4], t_pulp_sal: vals[5], t_amb_pre_in: vals[6], t_pulp_pre_in: vals[7], t_amb_pre_out: vals[8], t_pulp_pre_out: vals[9] };
        datosC5.packing3_c5.push(data);
        const tbody = document.getElementById('tbody-packing-temp_c5');
        if (tbody) agregarFilaC5Packing3(data, tbody, datosC5.packing3_c5.length);
        actualizarContadorPacking('next_clam_packing_temp_c5', datosC5.packing3_c5.length);
        REG_C5_TEMP_IDS.forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
        persistPackingSiThermoking();
        scheduleThermokingProgressRefresh();
    });

    const btnAddC5Packing4 = document.getElementById('btn-add-packing-humedad_c5');
    if (btnAddC5Packing4) btnAddC5Packing4.addEventListener('click', function () {
        const req = requiereFechaYEnsayoPacking();
        if (!req.ok) { Swal.fire({ title: 'Faltan datos', text: req.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        if (!canAgregarFilaC5('packing4_c5')) return;
        var rp = requierePrimeraFilaPesoC5();
        if (!rp.ok) { Swal.fire({ title: 'Primero: peso C5', text: rp.msg, icon: 'info', confirmButtonColor: '#2f7cc0' }); return; }
        const get = function (id) { return (document.getElementById(id) && document.getElementById(id).value) || ''; };
        const firstVal = get('reg_packing_humedad_recepcion_c5').trim();
        if (!firstVal) { Swal.fire({ title: 'Agregar fila', text: 'Complete al menos el primer campo (Humedad Recep.) para agregar la fila.', icon: 'info', confirmButtonColor: '#2f7cc0' }); return; }
        const n = parseFloat(firstVal.replace(',', '.'));
        if (isNaN(n) || n < 0) { Swal.fire({ title: 'Validación', text: 'El valor debe ser un número mayor o igual a 0.', icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        const vals = [get('reg_packing_humedad_recepcion_c5'), get('reg_packing_humedad_ingreso_gasificado_c5'), get('reg_packing_humedad_salida_gasificado_c5'), get('reg_packing_humedad_ingreso_prefrio_c5'), get('reg_packing_humedad_salida_prefrio_c5')];
        const res4 = validarPackingNumericoOpcional(vals);
        if (!res4.ok) { Swal.fire({ title: 'Validación', text: res4.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        const data = { recepcion: vals[0], ingreso_gasificado: vals[1], salida_gasificado: vals[2], ingreso_prefrio: vals[3], salida_prefrio: vals[4] };
        datosC5.packing4_c5.push(data);
        const tbody = document.getElementById('tbody-packing-humedad_c5');
        if (tbody) agregarFilaC5Packing4(data, tbody, datosC5.packing4_c5.length);
        actualizarContadorPacking('next_clam_packing_humedad_c5', datosC5.packing4_c5.length);
        ['reg_packing_humedad_recepcion_c5', 'reg_packing_humedad_ingreso_gasificado_c5', 'reg_packing_humedad_salida_gasificado_c5', 'reg_packing_humedad_ingreso_prefrio_c5', 'reg_packing_humedad_salida_prefrio_c5'].forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
        persistPackingSiThermoking();
        scheduleThermokingProgressRefresh();
    });

    const btnAddC5Packing5 = document.getElementById('btn-add-packing-presion_c5');
    if (btnAddC5Packing5) btnAddC5Packing5.addEventListener('click', function () {
        const req = requiereFechaYEnsayoPacking();
        if (!req.ok) { Swal.fire({ title: 'Faltan datos', text: req.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        if (!canAgregarFilaC5('packing5_c5')) return;
        var rp = requierePrimeraFilaPesoC5();
        if (!rp.ok) { Swal.fire({ title: 'Primero: peso C5', text: rp.msg, icon: 'info', confirmButtonColor: '#2f7cc0' }); return; }
        const get = function (id) { return (document.getElementById(id) && document.getElementById(id).value) || ''; };
        const firstVal = get('reg_packing_presion_recepcion_c5').trim();
        if (!firstVal) { Swal.fire({ title: 'Agregar fila', text: 'Complete al menos el primer campo (Presión Recep.) para agregar la fila.', icon: 'info', confirmButtonColor: '#2f7cc0' }); return; }
        const n = parseFloat(firstVal.replace(',', '.'));
        if (isNaN(n) || n < 0) { Swal.fire({ title: 'Validación', text: 'El valor debe ser un número mayor o igual a 0.', icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        const vals = [get('reg_packing_presion_recepcion_c5'), get('reg_packing_presion_ingreso_gasificado_c5'), get('reg_packing_presion_salida_gasificado_c5'), get('reg_packing_presion_ingreso_prefrio_c5'), get('reg_packing_presion_salida_prefrio_c5')];
        const res5 = validarPackingNumericoOpcional(vals);
        if (!res5.ok) { Swal.fire({ title: 'Validación', text: res5.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        const data = { recepcion: vals[0], ingreso_gasificado: vals[1], salida_gasificado: vals[2], ingreso_prefrio: vals[3], salida_prefrio: vals[4] };
        datosC5.packing5_c5.push(data);
        const tbody = document.getElementById('tbody-packing-presion_c5');
        if (tbody) agregarFilaC5Packing5(data, tbody, datosC5.packing5_c5.length);
        actualizarContadorPacking('next_clam_packing_presion_c5', datosC5.packing5_c5.length);
        ['reg_packing_presion_recepcion_c5', 'reg_packing_presion_ingreso_gasificado_c5', 'reg_packing_presion_salida_gasificado_c5', 'reg_packing_presion_ingreso_prefrio_c5', 'reg_packing_presion_salida_prefrio_c5'].forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
        persistPackingSiThermoking();
        scheduleThermokingProgressRefresh();
    });

    const btnAddC5Packing6 = document.getElementById('btn-add-packing-presion-fruta_c5');
    if (btnAddC5Packing6) btnAddC5Packing6.addEventListener('click', function () {
        const req = requiereFechaYEnsayoPacking();
        if (!req.ok) { Swal.fire({ title: 'Faltan datos', text: req.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        if (!canAgregarFilaC5('packing6_c5')) return;
        var rp = requierePrimeraFilaPesoC5();
        if (!rp.ok) { Swal.fire({ title: 'Primero: peso C5', text: rp.msg, icon: 'info', confirmButtonColor: '#2f7cc0' }); return; }
        const get = function (id) { return (document.getElementById(id) && document.getElementById(id).value) || ''; };
        const firstVal = get('reg_packing_presion_fruta_recepcion_c5').trim();
        if (!firstVal) { Swal.fire({ title: 'Agregar fila', text: 'Complete al menos el primer campo (Presión fruta Recep.) para agregar la fila.', icon: 'info', confirmButtonColor: '#2f7cc0' }); return; }
        const n = parseFloat(firstVal.replace(',', '.'));
        if (isNaN(n) || n < 0) { Swal.fire({ title: 'Validación', text: 'El valor debe ser un número mayor o igual a 0.', icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        const vals = [get('reg_packing_presion_fruta_recepcion_c5'), get('reg_packing_presion_fruta_ingreso_gasificado_c5'), get('reg_packing_presion_fruta_salida_gasificado_c5'), get('reg_packing_presion_fruta_ingreso_prefrio_c5'), get('reg_packing_presion_fruta_salida_prefrio_c5')];
        const res6 = validarPackingNumericoOpcional(vals);
        if (!res6.ok) { Swal.fire({ title: 'Validación', text: res6.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        const data = { recepcion: vals[0], ingreso_gasificado: vals[1], salida_gasificado: vals[2], ingreso_prefrio: vals[3], salida_prefrio: vals[4] };
        datosC5.packing6_c5.push(data);
        const tbody = document.getElementById('tbody-packing-presion-fruta_c5');
        if (tbody) agregarFilaC5Packing6(data, tbody, datosC5.packing6_c5.length);
        actualizarContadorPacking('next_clam_packing_presion_fruta_c5', datosC5.packing6_c5.length);
        ['reg_packing_presion_fruta_recepcion_c5', 'reg_packing_presion_fruta_ingreso_gasificado_c5', 'reg_packing_presion_fruta_salida_gasificado_c5', 'reg_packing_presion_fruta_ingreso_prefrio_c5', 'reg_packing_presion_fruta_salida_prefrio_c5'].forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
        persistPackingSiThermoking();
        scheduleThermokingProgressRefresh();
    });

    const btnAddC5Packing8 = document.getElementById('btn-add-packing-obs_c5');
    if (btnAddC5Packing8) btnAddC5Packing8.addEventListener('click', function () {
        const req = requiereFechaYEnsayoPacking();
        if (!req.ok) { Swal.fire({ title: 'Faltan datos', text: req.msg, icon: 'warning', confirmButtonColor: '#2f7cc0' }); return; }
        if (!canAgregarFilaC5('packing8_c5')) return;
        var rp = requierePrimeraFilaPesoC5();
        if (!rp.ok) { Swal.fire({ title: 'Primero: peso C5', text: rp.msg, icon: 'info', confirmButtonColor: '#2f7cc0' }); return; }
        const observacion = (document.getElementById('reg_packing_obs_texto_c5') && document.getElementById('reg_packing_obs_texto_c5').value) || '';
        if (!String(observacion).trim()) { Swal.fire({ title: 'Agregar fila', text: 'Escriba la observación o pulse Cancelar.', icon: 'info', confirmButtonColor: '#2f7cc0' }); return; }
        datosC5.packing8_c5.push({ observacion: observacion });
        const tbody = document.getElementById('tbody-packing-obs_c5');
        if (tbody) agregarFilaC5Packing8({ observacion: observacion }, tbody, datosC5.packing8_c5.length);
        actualizarContadorPacking('next_clam_packing_obs_c5', datosC5.packing8_c5.length);
        if (document.getElementById('reg_packing_obs_texto_c5')) document.getElementById('reg_packing_obs_texto_c5').value = '';
        persistPackingSiThermoking();
        scheduleThermokingProgressRefresh();
    });

    // --- VISUAL: restaurar datos del ensayo al cambiar rótulo ---
    function restaurarDatosEnsayo(tipo, ensayo) {
        if (tipo === 'visual' || tipo === 'acopio') {
            const datos = datosEnsayos[tipo][ensayo];
            
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
                (datos.jarras || []).forEach((item, index) => {
                    if (item && (item.tiempo == null || item.tiempo === '') && (item.inicio || item.termino)) {
                        item.tiempo = calcularTiempoEmpleado(item.inicio || '', item.termino || '');
                    }
                    agregarFilaJarras(item, tbodyJarras, index + 1);
                });
                actualizarContador('next_row_jarras', (datos.jarras || []).length);
            }
            actualizarCampoNJarraSegunTipo();
            
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
            
            // Respetar estado manual del usuario: no forzar apertura de wrappers.
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
        const tiempoMostrar = (data.tiempo != null && data.tiempo !== '') ? data.tiempo : calcularTiempoEmpleado(data.inicio || '', data.termino || '');
        const row = document.createElement('tr');
        row.setAttribute('data-row', rowNum);
        row.setAttribute('data-jarra', data.jarra);
        row.setAttribute('data-tipo', data.tipo);
        row.setAttribute('data-inicio', data.inicio);
        row.setAttribute('data-termino', data.termino);
        row.setAttribute('data-tiempo', tiempoMostrar);

        row.innerHTML = `
            <td class="row-id">${rowNum}</td>
            <td>${data.jarra}</td>
            <td>${data.tipo === 'C' ? 'Cosecha' : (data.tipo === 'T' ? 'Traslado' : data.tipo)}</td>
            <td>${data.inicio}</td>
            <td>${data.termino}</td>
            <td>${tiempoMostrar}</td>
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
        var html = '<div class="packing-modal-grid">' +
            '<div class="packing-modal-field"><label>N° Jarra:</label><input type="number" id="edit_jarra" class="swal2-input" value="' + (dataActual.jarra || '') + '"></div>' +
            '<div class="packing-modal-field"><label>Peso 1 (g):</label><input type="number" id="edit_p1" class="swal2-input" step="0.1" value="' + (dataActual.p1 || '') + '"></div>' +
            '<div class="packing-modal-field"><label>Peso 2 (g):</label><input type="number" id="edit_p2" class="swal2-input" step="0.1" value="' + (dataActual.p2 || '') + '"></div>' +
            '<div class="packing-modal-field"><label>Llegada Acopio (g):</label><input type="number" id="edit_llegada" class="swal2-input" step="0.1" value="' + (dataActual.llegada || '') + '"></div>' +
            '<div class="packing-modal-field"><label>Despacho Acopio (g):</label><input type="number" id="edit_despacho" class="swal2-input" step="0.1" value="' + (dataActual.despacho || '') + '"></div>' +
            '</div>';
        Swal.fire({
            title: `Editar Registro #${clamNum}`,
            customClass: { popup: 'packing-edit-modal' },
            html: html,
            confirmButtonText: 'Guardar',
            confirmButtonColor: '#2f7cc0',
            showCancelButton: true,
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const jarra = String(document.getElementById('edit_jarra').value || '').trim();
                const p1 = document.getElementById('edit_p1').value || '';
                const p2 = document.getElementById('edit_p2').value || '';
                const llegada = document.getElementById('edit_llegada').value || '';
                const despacho = document.getElementById('edit_despacho').value || '';
                if (jarra !== '' && !esNumeroPositivoEntero(jarra)) {
                    Swal.showValidationMessage('N° Jarra debe ser un número entero positivo.');
                    return undefined;
                }
                var res = validarVisualPesosOrden({ p1, p2, llegada, despacho });
                if (!res.ok) {
                    Swal.showValidationMessage(res.msg);
                    return undefined;
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
        var jarraDisplay = (dataActual.jarra != null && dataActual.jarra !== '') ? String(dataActual.jarra) : '—';
        var htmlJarra = '<div class="packing-modal-grid">' +
            '<div class="packing-modal-field"><label>N° Jarra:</label><span class="swal2-input" style="display:inline-block;background:#eee;color:#555;">' + jarraDisplay + '</span></div>' +
            '<div class="packing-modal-field"><label>Tipo:</label><select id="edit_tipo" class="swal2-input" disabled style="background:#eee;color:#555;cursor:not-allowed;"><option value="C"' + (dataActual.tipo === 'C' ? ' selected' : '') + '>Cosecha</option><option value="T"' + (dataActual.tipo === 'T' ? ' selected' : '') + '>Traslado</option></select></div>' +
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
                const jarra = (dataActual.jarra != null ? String(dataActual.jarra) : '').trim();
                const tipo = (document.getElementById('edit_tipo').value || '').trim();
                const inicio = document.getElementById('edit_inicio').value;
                const termino = document.getElementById('edit_termino').value;
                if (tipo !== 'C' && tipo !== 'T') {
                    Swal.showValidationMessage('El tipo debe ser Cosecha o Traslado.');
                    return undefined;
                }
                if (tipo === 'C' && jarra !== '' && !esNumeroPositivoEntero(jarra)) {
                    Swal.showValidationMessage('En Cosecha, N° Jarra debe ser un número entero positivo o vacío.');
                    return undefined;
                }
                if (tipo === 'T' && !jarra) {
                    Swal.showValidationMessage('En Traslado debes elegir una jarra o viaje grupal (ej. 1-2).');
                    return undefined;
                }
                if (inicio && termino && !tiempoMenorOIgual(inicio, termino)) {
                    Swal.showValidationMessage('La hora de término debe ser mayor o igual que la de inicio.');
                    return undefined;
                }
                // No duplicar: misma N° Jarra + mismo TIPO en otra fila (excluir la fila que estamos editando)
                const normJ = (v) => (v == null || v === '') ? '' : String(v).trim();
                const lista = datosEnsayos[tipoActual][ensayoActual].jarras || [];
                const duplicado = lista.some(function (j, i) {
                    return i !== rowNum - 1 && normJ(j.jarra) === normJ(jarra) && j.tipo === tipo;
                });
                if (duplicado) {
                    const tipoLabel = tipo === 'C' ? 'Cosecha' : 'Traslado';
                    Swal.showValidationMessage('Ya existe otra fila con N° Jarra "' + (jarra || '(vacío)') + '" y tipo "' + tipoLabel + '".');
                    return undefined;
                }
                // Traslado: inicio debe ser >= término de Cosecha (misma N° Jarra). Si editamos Cosecha y hay conflicto, se elimina la fila de Traslado (más seguro que formatear a 0).
                var listaEditada = lista.map(function (j, i) {
                    return i === rowNum - 1 ? { jarra: jarra, tipo: tipo, inicio: inicio, termino: termino } : j;
                });
                var resOrdenEdit = validarOrdenCosechaTrasladoJarras(listaEditada);
                var listaFinal = listaEditada;
                var trasladosEliminados = 0;
                if (!resOrdenEdit.ok && tipo === 'C' && jarra) {
                    var jarraNorm = String(jarra).trim();
                    listaFinal = listaEditada.filter(function (j) {
                        if (j.tipo !== 'T') return true;
                        var idsT = idsDeJarraTraslado(j.jarra);
                        var aplicaAJarra = idsT.indexOf(jarraNorm) >= 0;
                        if (!aplicaAJarra) return true;
                        if (!j.inicio || !termino) return true;
                        if (tiempoEnMinutos(j.inicio) < tiempoEnMinutos(termino)) {
                            trasladosEliminados++;
                            return false;
                        }
                        return true;
                    });
                } else if (!resOrdenEdit.ok) {
                    Swal.showValidationMessage(resOrdenEdit.msg);
                    return undefined;
                }
                const tiempo = calcularTiempoEmpleado(inicio, termino);
                return { jarra, tipo, inicio, termino, tiempo, listaFinal: listaFinal, trasladosEliminados: trasladosEliminados };
            }
        }).then((result) => {
            if (result.isConfirmed) {
                const v = result.value;
                const { jarra, tipo, inicio, termino, tiempo, listaFinal, trasladosEliminados } = v;
                if (trasladosEliminados && listaFinal) {
                    datosEnsayos[tipoActual][ensayoActual].jarras = listaFinal;
                } else {
                    datosEnsayos[tipoActual][ensayoActual].jarras[rowNum - 1] = { jarra, tipo, inicio, termino, tiempo };
                }
                restaurarDatosEnsayo(tipoActual, ensayoActual);
                if (trasladosEliminados) actualizarCampoNJarraSegunTipo();
                var msg = trasladosEliminados
                    ? (trasladosEliminados === 1
                        ? 'Se eliminó la fila de Traslado de la N° Jarra ' + (v.jarra || '') + ' para permitir el cambio en Cosecha. Puedes volver a agregar Traslado si lo necesitas.'
                        : 'Se eliminaron ' + trasladosEliminados + ' filas de Traslado para permitir el cambio en Cosecha. Puedes volver a agregar Traslado si lo necesitas.')
                    : 'Jarra actualizada correctamente';
                Swal.fire({
                    title: trasladosEliminados ? 'Cosecha actualizada' : 'Actualizado',
                    text: msg,
                    icon: 'success',
                    timer: trasladosEliminados ? 3500 : 1500,
                    showConfirmButton: !!trasladosEliminados
                });
            }
        });
    }

    function editarFilaTemperaturas(clamNum, dataActual) {
        var stages = [
            { name: 'Inicio', amb: (dataActual.inicio_amb ?? ''), pulp: (dataActual.inicio_pul ?? '') },
            { name: 'Término', amb: (dataActual.termino_amb ?? ''), pulp: (dataActual.termino_pul ?? '') },
            { name: 'Llegada', amb: (dataActual.llegada_amb ?? ''), pulp: (dataActual.llegada_pul ?? '') },
            { name: 'Despacho', amb: (dataActual.despacho_amb ?? ''), pulp: (dataActual.despacho_pul ?? '') }
        ];
        var idsAmb = ['edit_inicio_amb', 'edit_termino_amb', 'edit_llegada_amb', 'edit_despacho_amb'];
        var idsPulp = ['edit_inicio_pul', 'edit_termino_pul', 'edit_llegada_pul', 'edit_despacho_pul'];
        var html = '<div class="packing-modal-temp-2cols">';
        stages.forEach(function (s, i) {
            html += '<div class="temp-stage-row">';
            html += '<div class="temp-stage-name">' + s.name + '</div>';
            html += '<div class="temp-stage-fields">';
            html += '<div class="temp-field"><label title="T° Ambiente"><i data-lucide="thermometer-sun" class="temp-icon"></i> T° Amb</label><input type="number" step="0.1" min="0" id="' + idsAmb[i] + '" class="swal2-input" value="' + (s.amb !== undefined && s.amb !== null ? s.amb : '') + '"></div>';
            html += '<div class="temp-field"><label title="T° Pulpa"><i data-lucide="cherry" class="temp-icon"></i> T° Pulp</label><input type="number" step="0.1" min="0" id="' + idsPulp[i] + '" class="swal2-input" value="' + (s.pulp !== undefined && s.pulp !== null ? s.pulp : '') + '"></div>';
            html += '</div></div>';
        });
        html += '</div>';
        Swal.fire({
            title: `Editar Temperaturas (°C) — Fila #${clamNum}`,
            customClass: { popup: 'packing-edit-modal packing-edit-modal-temp' },
            html: html,
            confirmButtonText: 'Guardar',
            confirmButtonColor: '#2f7cc0',
            showCancelButton: true,
            cancelButtonText: 'Cancelar',
            didOpen: function () { if (window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons(); },
            preConfirm: () => {
                const campos = ['edit_inicio_amb', 'edit_inicio_pul', 'edit_termino_amb', 'edit_termino_pul', 'edit_llegada_amb', 'edit_llegada_pul', 'edit_despacho_amb', 'edit_despacho_pul'];
                const vals = {};
                for (const id of campos) {
                    const v = String(document.getElementById(id).value || '').trim();
                    vals[id] = v;
                    if (v !== '' && !esNumeroNoNegativo(v)) {
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
        var v = function (x) { return (x != null && x !== '') ? x : ''; };
        var html = '<div class="packing-modal-grid">' +
            '<div class="packing-modal-field"><label>Inicio Cosecha:</label><input type="time" id="edit_inicio" class="swal2-input" value="' + v(dataActual.inicio) + '"></div>' +
            '<div class="packing-modal-field"><label>Pérdida Peso:</label><input type="time" id="edit_perdida" class="swal2-input" value="' + v(dataActual.perdida) + '"></div>' +
            '<div class="packing-modal-field"><label>Término Cosecha:</label><input type="time" id="edit_termino" class="swal2-input" value="' + v(dataActual.termino) + '"></div>' +
            '<div class="packing-modal-field"><label>Llegada Acopio:</label><input type="time" id="edit_llegada" class="swal2-input" value="' + v(dataActual.llegada) + '"></div>' +
            '<div class="packing-modal-field"><label>Despacho Acopio:</label><input type="time" id="edit_despacho" class="swal2-input" value="' + v(dataActual.despacho) + '"></div>' +
            '</div>';
        Swal.fire({
            title: `Editar Tiempos #${clamNum}`,
            customClass: { popup: 'packing-edit-modal' },
            html: html,
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
                var res = validarTiemposMuestraOrden({ inicio, perdida, termino, llegada, despacho });
                if (!res.ok) {
                    Swal.showValidationMessage(res.msg);
                    return undefined;
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
        var v = function (x) { return (x != null && x !== '') ? x : ''; };
        var html = '<div class="packing-modal-grid">' +
            '<div class="packing-modal-field"><label>Inicio (%):</label><input type="number" id="edit_inicio" class="swal2-input" step="0.1" value="' + v(dataActual.inicio) + '"></div>' +
            '<div class="packing-modal-field"><label>Término (%):</label><input type="number" id="edit_termino" class="swal2-input" step="0.1" value="' + v(dataActual.termino) + '"></div>' +
            '<div class="packing-modal-field"><label>Llegada (%):</label><input type="number" id="edit_llegada" class="swal2-input" step="0.1" value="' + v(dataActual.llegada) + '"></div>' +
            '<div class="packing-modal-field"><label>Despacho (%):</label><input type="number" id="edit_despacho" class="swal2-input" step="0.1" value="' + v(dataActual.despacho) + '"></div>' +
            '</div>';
        Swal.fire({
            title: `Editar Humedad #${clamNum}`,
            customClass: { popup: 'packing-edit-modal' },
            html: html,
            confirmButtonText: 'Guardar',
            confirmButtonColor: '#2f7cc0',
            showCancelButton: true,
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const inicio = (document.getElementById('edit_inicio').value || '').trim();
                const termino = (document.getElementById('edit_termino').value || '').trim();
                const llegada = (document.getElementById('edit_llegada').value || '').trim();
                const despacho = (document.getElementById('edit_despacho').value || '').trim();
                for (const v of [inicio, termino, llegada, despacho]) {
                    if (v !== '' && !esNumeroNoNegativo(v)) {
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
        var v = function (x) { return (x != null && x !== '') ? x : ''; };
        var html = '<div class="packing-modal-grid">' +
            '<div class="packing-modal-field"><label>Inicio (kPa):</label><input type="number" id="edit_inicio" class="swal2-input" step="0.001" value="' + v(dataActual.inicio) + '"></div>' +
            '<div class="packing-modal-field"><label>Término (kPa):</label><input type="number" id="edit_termino" class="swal2-input" step="0.001" value="' + v(dataActual.termino) + '"></div>' +
            '<div class="packing-modal-field"><label>Llegada (kPa):</label><input type="number" id="edit_llegada" class="swal2-input" step="0.001" value="' + v(dataActual.llegada) + '"></div>' +
            '<div class="packing-modal-field"><label>Despacho (kPa):</label><input type="number" id="edit_despacho" class="swal2-input" step="0.001" value="' + v(dataActual.despacho) + '"></div>' +
            '</div>';
        Swal.fire({
            title: `Editar Presión Ambiente #${clamNum}`,
            customClass: { popup: 'packing-edit-modal' },
            html: html,
            confirmButtonText: 'Guardar',
            confirmButtonColor: '#2f7cc0',
            showCancelButton: true,
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const inicio = (document.getElementById('edit_inicio').value || '').trim();
                const termino = (document.getElementById('edit_termino').value || '').trim();
                const llegada = (document.getElementById('edit_llegada').value || '').trim();
                const despacho = (document.getElementById('edit_despacho').value || '').trim();
                for (const v of [inicio, termino, llegada, despacho]) {
                    if (v !== '' && !esNumeroNoNegativo(v)) {
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
        var v = function (x) { return (x != null && x !== '') ? x : ''; };
        var html = '<div class="packing-modal-grid">' +
            '<div class="packing-modal-field"><label>Inicio (kPa):</label><input type="number" id="edit_inicio" class="swal2-input" step="0.001" value="' + v(dataActual.inicio) + '"></div>' +
            '<div class="packing-modal-field"><label>Término (kPa):</label><input type="number" id="edit_termino" class="swal2-input" step="0.001" value="' + v(dataActual.termino) + '"></div>' +
            '<div class="packing-modal-field"><label>Llegada (kPa):</label><input type="number" id="edit_llegada" class="swal2-input" step="0.001" value="' + v(dataActual.llegada) + '"></div>' +
            '<div class="packing-modal-field"><label>Despacho (kPa):</label><input type="number" id="edit_despacho" class="swal2-input" step="0.001" value="' + v(dataActual.despacho) + '"></div>' +
            '</div>';
        Swal.fire({
            title: `Editar Presión Fruta #${clamNum}`,
            customClass: { popup: 'packing-edit-modal' },
            html: html,
            confirmButtonText: 'Guardar',
            confirmButtonColor: '#2f7cc0',
            showCancelButton: true,
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const inicio = (document.getElementById('edit_inicio').value || '').trim();
                const termino = (document.getElementById('edit_termino').value || '').trim();
                const llegada = (document.getElementById('edit_llegada').value || '').trim();
                const despacho = (document.getElementById('edit_despacho').value || '').trim();
                for (const v of [inicio, termino, llegada, despacho]) {
                    if (v !== '' && !esNumeroNoNegativo(v)) {
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
        var obsVal = (dataActual.observacion != null && dataActual.observacion !== undefined) ? String(dataActual.observacion) : '';
        var html = '<div class="packing-modal-grid"><div class="packing-modal-field"><label>Observación:</label><textarea id="edit_obs" class="swal2-input" rows="3" style="width:100%;margin:0;min-height:80px;box-sizing:border-box;">' + obsVal.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</textarea></div></div>';
        Swal.fire({
            title: `Editar Observación #${clamNum}`,
            customClass: { popup: 'packing-edit-modal' },
            html: html,
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
                var lista = datosEnsayos[tipoActual][ensayoActual][tipo];
                var filaEliminada = lista[num - 1];
                var eraCosecha = filaEliminada && filaEliminada.tipo === 'C';
                var jarraCosecha = (eraCosecha && filaEliminada.jarra != null) ? String(filaEliminada.jarra).trim() : '';

                lista.splice(num - 1, 1);

                // Si se elimina una fila en Visual (referencia), recortar la misma posición
                // en wrappers vinculados para mantener consistencia de filas.
                if (tipo === 'visual') {
                    var vinculados = ['tiempos', 'temperaturas', 'humedad', 'presionambiente', 'presionfruta', 'observacion'];
                    vinculados.forEach(function (k) {
                        var arr = datosEnsayos[tipoActual] && datosEnsayos[tipoActual][ensayoActual] ? datosEnsayos[tipoActual][ensayoActual][k] : null;
                        if (!arr || !Array.isArray(arr)) return;
                        if (num - 1 < arr.length) arr.splice(num - 1, 1);
                    });
                }

                if (tipo === 'jarras' && eraCosecha && jarraCosecha) {
                    for (var i = lista.length - 1; i >= 0; i--) {
                        if (lista[i].tipo !== 'T') continue;
                        var j = ('' + (lista[i].jarra || '')).trim();
                        var incluyeJarra = (j === jarraCosecha) || (j.indexOf('-') >= 0 && j.split('-').map(function (x) { return (x || '').trim(); }).indexOf(jarraCosecha) >= 0);
                        if (incluyeJarra) lista.splice(i, 1);
                    }
                }

                try {
                    restaurarDatosEnsayo(tipoActual, ensayoActual);
                    if (tipo === 'jarras') {
                        var selTipo = document.getElementById('reg_jarras_tipo');
                        var tipoAntes = (selTipo && selTipo.value) ? (selTipo.value || '').trim() : '';
                        actualizarCampoNJarraSegunTipo();
                        var selJarra = document.getElementById('reg_jarras_n_jarra');
                        if (selJarra) selJarra.value = '';
                        if (selTipo) selTipo.value = tipoAntes || '';
                        actualizarCampoNJarraSegunTipo();
                        setTimeout(function () {
                            try { actualizarCampoNJarraSegunTipo(); } catch (e2) { console.warn('actualizarCampoNJarraSegunTipo:', e2); }
                        }, 50);
                    }
                } catch (e) {
                    console.error('Error al eliminar fila jarras:', e);
                }
                window.formHasChanges = true;

                Swal.fire({
                    title: 'Eliminado',
                    text: eraCosecha && tipo === 'jarras' ? 'Cosecha y sus Traslados asociados eliminados correctamente' : 'Registro eliminado correctamente',
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
        header.addEventListener('click', function (e) {
            var targetId = header.getAttribute('data-target');
            if (targetId === 'body-packing-panel') {
                var wp = header.closest('#wrapper_packing_panel');
                if (wp && wp.classList.contains('packing-panel--bloqueado-hoja')) {
                    e.preventDefault();
                    e.stopPropagation();
                    toastPackingPanelBloqueadoPorHoja_();
                    return;
                }
            }
            if (targetId) toggleCollapsible(targetId);
        });
        header.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            var targetIdK = header.getAttribute('data-target');
            if (targetIdK === 'body-packing-panel') {
                var wpk = header.closest('#wrapper_packing_panel');
                if (wpk && wpk.classList.contains('packing-panel--bloqueado-hoja')) {
                    e.preventDefault();
                    toastPackingPanelBloqueadoPorHoja_();
                    return;
                }
            }
            e.preventDefault();
            if (targetIdK) toggleCollapsible(targetIdK);
        });
    });

    const inputInicio = document.getElementById('reg_jarras_inicio');
    const inputTermino = document.getElementById('reg_jarras_termino');
    const spanTiempo = document.getElementById('reg_jarras_tiempo');

    function actualizarTiempoJarrasInput() {
        const inicio = inputInicio.value;
        const termino = inputTermino.value;
        if (inicio && termino) {
            spanTiempo.textContent = calcularTiempoEmpleado(inicio, termino);
        } else {
            spanTiempo.textContent = "0'";
        }
    }
    if (inputInicio && inputTermino && spanTiempo) {
        [inputInicio, inputTermino].forEach(input => {
            input.addEventListener('input', actualizarTiempoJarrasInput);
            input.addEventListener('change', () => {
                var tipoEl = document.getElementById('reg_jarras_tipo');
                var jarraEl = document.getElementById('reg_jarras_n_jarra');
                if (inputInicio === input && tipoEl && jarraEl) {
                    var tipo = (tipoEl.value || '').trim();
                    var jarra = (jarraEl.value || '').trim();
                    if (tipo === 'T' && jarra) {
                        var terminoCosecha = getTerminoCosechaParaJarra(ensayoActual, jarra);
                        var inicioVal = inputInicio.value || '';
                        if (terminoCosecha && inicioVal && tiempoEnMinutos(inicioVal) < tiempoEnMinutos(terminoCosecha)) {
                            Swal.fire({
                                title: 'Hora inválida',
                                text: 'El inicio de Traslado debe ser igual o posterior al término de Cosecha (' + terminoCosecha + ') para la misma N° Jarra.',
                                icon: 'error',
                                confirmButtonColor: '#2f7cc0'
                            });
                            inputInicio.value = terminoCosecha;
                        }
                    }
                }
                actualizarTiempoJarrasInput();
            });
        });
        inputInicio.addEventListener('focus', function () {
            if (!inputInicio.value && document.getElementById('reg_jarras_tipo') && (document.getElementById('reg_jarras_tipo').value || '').trim() === 'T') {
                llenarInicioTrasladoSegunCosecha();
            }
        });
    }

    /** Validación Visual: Peso 1 ≥ Peso 2 ≥ Llegada ≥ Despacho. Cualquier valor posterior debe ser ≤ al anterior (también con campos vacíos en medio). */
    function validarVisualPesosOrden(data) {
        var nums = [
            parseFloat(String(data.p1 || '').replace(',', '.')),
            parseFloat(String(data.p2 || '').replace(',', '.')),
            parseFloat(String(data.llegada || '').replace(',', '.')),
            parseFloat(String(data.despacho || '').replace(',', '.'))
        ];
        var nombres = ['Peso 1', 'Peso 2', 'Llegada', 'Despacho'];
        for (var i = 0; i < nums.length; i++) {
            if (!isNaN(nums[i]) && nums[i] < 0) return { ok: false, msg: 'Los pesos deben ser mayores o iguales a 0.' };
        }
        for (var i = 0; i < nums.length; i++) {
            for (var j = i + 1; j < nums.length; j++) {
                if (!isNaN(nums[i]) && !isNaN(nums[j]) && nums[j] > nums[i]) {
                    return { ok: false, msg: nombres[i] + ' ≥ ' + nombres[j] + ' (' + nombres[j] + ' debe ser menor o igual).' };
                }
            }
        }
        return { ok: true };
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
            if (tipoActual !== 'visual' && tipoActual !== 'acopio') {
                Swal.fire({
                    title: 'Atención',
                    text: 'Los pesos visuales solo aplican a Calibrado Visual o Calibrado Acopio. Elige el formato en «Formato Campo».',
                    icon: 'warning',
                    confirmButtonColor: '#2f7cc0'
                });
                return;
            }
            var bucketVis = datosEnsayos[tipoActual] && datosEnsayos[tipoActual][ensayoActual];
            if (!bucketVis) {
                Swal.fire({
                    title: 'Atención',
                    text: 'No hay datos de ensayo para este formato. Vuelve a elegir el ensayo o el tipo de medición.',
                    icon: 'warning',
                    confirmButtonColor: '#2f7cc0'
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
            var resPesos = validarVisualPesosOrden({ p1, p2, llegada, despacho });
            if (!resPesos.ok) {
                Swal.fire({
                    title: 'Orden de pesos',
                    text: resPesos.msg,
                    icon: 'warning',
                    confirmButtonColor: '#2f7cc0'
                });
                return;
            }

            const tbody = document.getElementById('tbody-visual');
            const rowData = { jarra, p1, p2, llegada, despacho };
            
            bucketVis.visual.push(rowData);
            const clamNum = bucketVis.visual.length;
            
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
            if (tipoActual !== 'visual' && tipoActual !== 'acopio') {
                Swal.fire({
                    title: 'Atención',
                    text: 'Las jarras (Cosecha/Traslado) solo aplican a Calibrado Visual o Calibrado Acopio. Elige el formato en «Formato Campo» arriba.',
                    icon: 'warning',
                    confirmButtonColor: '#2f7cc0'
                });
                return;
            }
            var bucketJarras = datosEnsayos[tipoActual] && datosEnsayos[tipoActual][ensayoActual];
            if (!bucketJarras) {
                Swal.fire({
                    title: 'Atención',
                    text: 'No hay datos de ensayo para este formato. Vuelve a elegir el ensayo o el tipo de medición.',
                    icon: 'warning',
                    confirmButtonColor: '#2f7cc0'
                });
                return;
            }
            
            const jarra = document.getElementById('reg_jarras_n_jarra').value.trim();
            const tipo = (document.getElementById('reg_jarras_tipo').value || '').trim();
            const inicio = document.getElementById('reg_jarras_inicio').value || '';
            const termino = document.getElementById('reg_jarras_termino').value || '';

            if (tipo !== 'C' && tipo !== 'T') {
                Swal.fire({
                    title: 'Tipo inválido',
                    text: 'El tipo debe ser Cosecha o Traslado. No se puede guardar como Calibrado Visual.',
                    icon: 'warning',
                    confirmButtonColor: '#2f7cc0'
                });
                return;
            }
            if (!jarra) {
                Swal.fire({
                    title: 'Selecciona N° Jarra',
                    text: 'Elige una jarra en el desplegable (o viaje grupal si es Traslado).',
                    icon: 'warning',
                    confirmButtonColor: '#2f7cc0'
                });
                return;
            }
            if (!inicio || !inicio.trim()) {
                Swal.fire({
                    title: 'Hora de inicio requerida',
                    text: 'Debes ingresar la hora de inicio para agregar la fila.',
                    icon: 'warning',
                    confirmButtonColor: '#2f7cc0'
                });
                return;
            }
            if (tipo === 'C' && jarra.indexOf('-') >= 0) {
                Swal.fire({
                    title: 'Cosecha: una jarra',
                    text: 'En Cosecha elige una jarra individual (1, 2…), no el viaje grupal.',
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

            // No permitir duplicado: mismo N° Jarra + mismo TIPO (ej. dos veces "Cosecha" con jarra 1)
            const normJarra = (v) => (v == null || v === '') ? '' : String(v).trim();
            const yaExiste = (bucketJarras.jarras || []).some(function (j) {
                return normJarra(j.jarra) === normJarra(jarra) && j.tipo === tipo;
            });
            if (yaExiste) {
                const tipoLabel = tipo === 'C' ? 'Cosecha' : 'Traslado';
                Swal.fire({
                    title: 'Registro duplicado',
                    text: 'Ya existe una fila con N° Jarra "' + (jarra || '(vacío)') + '" y tipo "' + tipoLabel + '". No se puede repetir la misma combinación.',
                    icon: 'warning',
                    confirmButtonColor: '#2f7cc0'
                });
                return;
            }

            // Traslado: inicio y término deben ser >= término de Cosecha (misma N° Jarra)
            var listaConNueva = (bucketJarras.jarras || []).concat([{ jarra: jarra, tipo: tipo, inicio: inicio, termino: termino }]);
            var resOrden = validarOrdenCosechaTrasladoJarras(listaConNueva);
            if (!resOrden.ok) {
                Swal.fire({
                    title: 'Hora inválida',
                    text: resOrden.msg,
                    icon: 'warning',
                    confirmButtonColor: '#2f7cc0'
                });
                return;
            }

            const tiempo = calcularTiempoEmpleado(inicio, termino);
            const tbody = document.getElementById('tbody-jarras');
            const rowData = { jarra, tipo, inicio, termino, tiempo };
            
            bucketJarras.jarras.push(rowData);
            const rowNum = bucketJarras.jarras.length;
            
            agregarFilaJarras(rowData, tbody, rowNum);
            actualizarContador('next_row_jarras', rowNum);
            window.formHasChanges = true;

            document.getElementById('reg_jarras_tipo').value = '';
            actualizarCampoNJarraSegunTipo();
            document.getElementById('reg_jarras_inicio').value = '';
            document.getElementById('reg_jarras_termino').value = '';
            document.getElementById('reg_jarras_tiempo').textContent = "0'";
            var jarraEl = document.getElementById('reg_jarras_n_jarra');
            if (jarraEl) jarraEl.focus();
        });
    }

    var regJarrasTipo = document.getElementById('reg_jarras_tipo');
    if (regJarrasTipo) regJarrasTipo.addEventListener('change', function () {
        actualizarCampoNJarraSegunTipo();
        if ((regJarrasTipo.value || '').trim() === 'T') setTimeout(function () { llenarInicioTrasladoSegunCosecha(); }, 50);
    });
    var wrapperJarras = document.getElementById('wrapper_jarras');
    if (wrapperJarras) wrapperJarras.addEventListener('change', function (e) {
        if (e.target && e.target.id === 'reg_jarras_n_jarra') actualizarTipoSegunJarra();
    });

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
            const maxClam = datosEnsayos[tipoActual][ensayoActual].visual.length;
            if (datosEnsayos[tipoActual][ensayoActual].temperaturas.length >= maxClam) {
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
            
            datosEnsayos[tipoActual][ensayoActual].temperaturas.push(rowData);
            const clamNum = datosEnsayos[tipoActual][ensayoActual].temperaturas.length;
            
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
            const maxClam = datosEnsayos[tipoActual][ensayoActual].visual.length;
            if (datosEnsayos[tipoActual][ensayoActual].tiempos.length >= maxClam) {
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

            var resTiempos = validarTiemposMuestraOrden({ inicio, perdida, termino, llegada, despacho });
            if (!resTiempos.ok) {
                Swal.fire({
                    title: 'Orden de tiempos',
                    text: resTiempos.msg,
                    icon: 'warning',
                    confirmButtonColor: '#2f7cc0'
                });
                return;
            }

            const tbody = document.getElementById('tbody-tiempos');
            const rowData = { inicio, perdida, termino, llegada, despacho };
            
            datosEnsayos[tipoActual][ensayoActual].tiempos.push(rowData);
            const clamNum = datosEnsayos[tipoActual][ensayoActual].tiempos.length;
            
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
            const maxClam = datosEnsayos[tipoActual][ensayoActual].visual.length;
            if (datosEnsayos[tipoActual][ensayoActual].humedad.length >= maxClam) {
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
            
            datosEnsayos[tipoActual][ensayoActual].humedad.push(rowData);
            const clamNum = datosEnsayos[tipoActual][ensayoActual].humedad.length;
            
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
            const maxClam = datosEnsayos[tipoActual][ensayoActual].visual.length;
            if (datosEnsayos[tipoActual][ensayoActual].presionambiente.length >= maxClam) {
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
            
            datosEnsayos[tipoActual][ensayoActual].presionambiente.push(rowData);
            const clamNum = datosEnsayos[tipoActual][ensayoActual].presionambiente.length;
            
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
            const maxClam = datosEnsayos[tipoActual][ensayoActual].visual.length;
            if (datosEnsayos[tipoActual][ensayoActual].presionfruta.length >= maxClam) {
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
            
            datosEnsayos[tipoActual][ensayoActual].presionfruta.push(rowData);
            const clamNum = datosEnsayos[tipoActual][ensayoActual].presionfruta.length;
            
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
            const maxClam = datosEnsayos[tipoActual][ensayoActual].visual.length;
            if (datosEnsayos[tipoActual][ensayoActual].observacion.length >= maxClam) {
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
            
            datosEnsayos[tipoActual][ensayoActual].observacion.push(rowData);
            const clamNum = datosEnsayos[tipoActual][ensayoActual].observacion.length;
            
            agregarFilaObservacion(rowData, tbody, clamNum);
            actualizarContador('next_clam_obs', clamNum);
            window.formHasChanges = true;

            document.getElementById('reg_observacion_texto').value = '';
            document.getElementById('reg_observacion_texto').focus();
        });
    }

    /** Valida que cada fila del Visual tenga todos los inputs llenos (como validarPackingCompletoParaGuardar). Devuelve { ok: true } o { ok: false, msg, fila, seccion, ensayo }. */
    function validarVisualCompletoParaGuardar(datosDelTipo, ensayosAIncluir) {
        if (!datosDelTipo || !ensayosAIncluir || ensayosAIncluir.length === 0) return { ok: true };
        const vacio = function (v) { return v === null || v === undefined || (typeof v === 'string' && String(v).trim() === ''); };
        const nombresSeccion = { visual: 'Pesos (Visual)', temperaturas: 'Temperatura muestra', tiempos: 'Tiempos', humedad: 'Humedad', presionambiente: 'Presión ambiente', presionfruta: 'Presión fruta' };
        for (let numE of ensayosAIncluir) {
            const ed = datosDelTipo[numE];
            if (!ed || !ed.visual || ed.visual.length === 0) continue;
            const n = ed.visual.length;
            for (let i = 0; i < n; i++) {
                const v = ed.visual[i] || {};
                if (vacio(v.jarra) || vacio(v.p1) || vacio(v.p2) || vacio(v.llegada) || vacio(v.despacho)) return { ok: false, msg: 'complete todos los campos de ' + nombresSeccion.visual + '.', fila: i + 1, seccion: nombresSeccion.visual, ensayo: numE };
                const temp = (ed.temperaturas && ed.temperaturas[i]) || {};
                const camposTemp = ['inicio_amb', 'inicio_pul', 'termino_amb', 'termino_pul', 'llegada_amb', 'llegada_pul', 'despacho_amb', 'despacho_pul'];
                for (let c = 0; c < camposTemp.length; c++) { if (vacio(temp[camposTemp[c]])) return { ok: false, msg: 'complete todos los campos de ' + nombresSeccion.temperaturas + '.', fila: i + 1, seccion: nombresSeccion.temperaturas, ensayo: numE }; }
                const tiempo = (ed.tiempos && ed.tiempos[i]) || {};
                if (vacio(tiempo.inicio) || vacio(tiempo.perdida) || vacio(tiempo.termino) || vacio(tiempo.llegada) || vacio(tiempo.despacho)) return { ok: false, msg: 'complete todos los campos de ' + nombresSeccion.tiempos + '.', fila: i + 1, seccion: nombresSeccion.tiempos, ensayo: numE };
                const hum = (ed.humedad && ed.humedad[i]) || {};
                if (vacio(hum.inicio) || vacio(hum.termino) || vacio(hum.llegada) || vacio(hum.despacho)) return { ok: false, msg: 'complete todos los campos de ' + nombresSeccion.humedad + '.', fila: i + 1, seccion: nombresSeccion.humedad, ensayo: numE };
                const pAmb = (ed.presionambiente && ed.presionambiente[i]) || {};
                if (vacio(pAmb.inicio) || vacio(pAmb.termino) || vacio(pAmb.llegada) || vacio(pAmb.despacho)) return { ok: false, msg: 'complete todos los campos de ' + nombresSeccion.presionambiente + '.', fila: i + 1, seccion: nombresSeccion.presionambiente, ensayo: numE };
                const pFru = (ed.presionfruta && ed.presionfruta[i]) || {};
                if (vacio(pFru.inicio) || vacio(pFru.termino) || vacio(pFru.llegada) || vacio(pFru.despacho)) return { ok: false, msg: 'complete todos los campos de ' + nombresSeccion.presionfruta + '.', fila: i + 1, seccion: nombresSeccion.presionfruta, ensayo: numE };
                /* Fila a fila de observaciones: texto opcional */
            }
        }
        return { ok: true };
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

            // Si hay datos en Pesos (Visual), debe haber al menos una fila en Tiempo de llenado de jarras por ese ensayo
            const ensayoSinJarras = ensayosAIncluir.find(function(numE) {
                const ed = datosDelTipo[numE];
                return ed && ed.visual && ed.visual.length > 0 && (!ed.jarras || ed.jarras.length === 0);
            });
            if (ensayoSinJarras) {
                Swal.fire({
                    title: 'Falta tiempo de llenado de jarras',
                    text: 'El Ensayo ' + ensayoSinJarras + ' tiene datos en Pesos (Visual). Debe haber al menos una fila en "Tiempo de llenado de jarras" para ese ensayo.',
                    icon: 'warning',
                    confirmButtonColor: '#2f7cc0'
                });
                toggleSaving(false);
                return;
            }

            var viewCampo = document.getElementById('view_visual_container');
            if (viewCampo && (tipoMedicion === 'visual' || tipoMedicion === 'acopio')) {
                var rUiCampo = validarProgresoUiEnContenedores([{ el: viewCampo, nombre: 'Formato campo' }]);
                if (!rUiCampo.ok) {
                    Swal.fire({
                        title: 'Formato incompleto',
                        html: rUiCampo.msg,
                        icon: 'warning',
                        confirmButtonColor: '#2f7cc0'
                    });
                    toggleSaving(false);
                    return;
                }
            }

            // Validar que cada fila tenga todos los inputs llenos en todos los wrappers (como en Packing)
            const validVisual = validarVisualCompletoParaGuardar(datosDelTipo, ensayosAIncluir);
            if (!validVisual.ok) {
                Swal.fire({
                    title: 'Campos incompletos',
                    html: 'Al guardar, cada fila debe tener todos los campos llenos en cada sección.<br><br><strong>Ensayo ' + validVisual.ensayo + ', Fila ' + validVisual.fila + ':</strong> ' + validVisual.msg,
                    icon: 'error',
                    confirmButtonColor: '#d33'
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
                        // Buscar jarras tipo C y T para esta jarra (Traslado "1-2" aplica a jarra 1 y 2)
                        function jarraTrasladoAplicaA(trasladoJarra, visualJarra) {
                            var n = (v) => (v == null || v === '') ? '' : String(v).trim();
                            var v = n(visualJarra);
                            var t = n(trasladoJarra);
                            if (t === v) return true;
                            if (t.indexOf('-') >= 0) {
                                var ids = t.split('-').map(function (s) { return n(s); }).filter(Boolean);
                                return ids.indexOf(v) >= 0;
                            }
                            return false;
                        }
                        const jarraC = ensayo.jarras ? ensayo.jarras.find(j => normJarra(j.jarra) === vJarra && j.tipo === 'C') : null;
                        const jarraT = ensayo.jarras ? ensayo.jarras.find(j => j.tipo === 'T' && jarraTrasladoAplicaA(j.jarra, vJarra)) : null;
                        
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
                    
                    // Caso BACKUP: Jarras con tiempos pero sin peso (capturar C y T). Traslado "1-2" aplica a todas las jarras en el grupo.
                    if (ensayo.jarras) {
                        const nJarraNum = (j) => (j.jarra !== '' && j.jarra != null && j.jarra.toString().indexOf('-') < 0) ? (parseInt(j.jarra) || 0) : 0;
                        ensayo.jarras.forEach(jarra => {
                            if (jarra.tipo !== 'C' && jarra.tipo !== 'T') return;
                            const esC = jarra.tipo === 'C';
                            const esT = jarra.tipo === 'T';
                            var idsTraslado = esT && (jarra.jarra + '').indexOf('-') >= 0 ? idsDeJarraTraslado(jarra.jarra) : [];
                            if (esT && idsTraslado.length > 0) {
                                idsTraslado.forEach(function (idStr) {
                                    var nJ = parseInt(idStr, 10) || 0;
                                    var existente = registrosCombinados.find(function (r) { return r.n_jarra === nJ; });
                                    if (existente && !existente.inicio_t) {
                                        existente.inicio_t = jarra.inicio || '';
                                        existente.termino_t = jarra.termino || '';
                                        existente.min_t = jarra.tiempo || '';
                                    }
                                });
                                return;
                            }
                            const nJarra = nJarraNum(jarra);
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
                    const headerEnsayo = (datosDelTipo[numEnsayo] && datosDelTipo[numEnsayo].formHeader) || {};
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
                        const contentWidth = 180;
                        const margin = (pageW - contentWidth) / 2;
                        const marginTopEncabezado = 14;
                        const fontSize = 9;
                        const headerH = 18;
                        const headerLeftW = 36;
                        const headerRightW = 36;
                        const headerCenterW = contentWidth - headerLeftW - headerRightW;
                        const lineH = 6;
                        const yMax = 278;

                        const renderEnsayoPdf = (rowsEnsayo, firstPage) => {
                            const rows = (rowsEnsayo || []).slice();
                            if (!rows.length) return;
                            if (!firstPage) doc.addPage();
                            let y = marginTopEncabezado;
                            const r0 = rows[0] || [];
                            const trazabilidadStr = [r0[7], r0[8], r0[9]].filter(Boolean).length ? 'E' + (r0[7] || '') + '-C' + (r0[8] || '') + (r0[9] ? '-' + r0[9] : '') : (r0[7] || '') + '/' + (r0[8] || '');

                            doc.setDrawColor(0, 0, 0);
                            doc.setLineWidth(0.3);
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
                            const paddingDatos = 6;
                            const startYDatos = y;
                            const bullet = '\u2022';
                            doc.setFontSize(8);
                            doc.setFont(undefined, 'bold');
                            const rowHDatos = 5;
                            const gapDespuesTitulo = 6;
                            const tituloDatosH = 2;
                            const blockH = paddingDatos + tituloDatosH + gapDespuesTitulo + 6 * rowHDatos;
                            doc.rect(margin, startYDatos, contentWidth, blockH);
                            y += paddingDatos;
                            doc.text('Datos del registro', margin + contentWidth / 2, y, { align: 'center' });
                            y += gapDespuesTitulo;
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
                            const leftX = margin + paddingDatos;
                            const rightX = margin + colW + paddingDatos;
                            const rowH = rowHDatos;
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
                            y = startYDatos + blockH + 1;

                            doc.setDrawColor(0, 0, 0);
                            doc.setLineWidth(0.4);
                            const toNum = (v) => {
                                var n = Number(String(v == null ? '' : v).trim().replace(',', '.'));
                                return Number.isFinite(n) ? n : NaN;
                            };
                            const drawTable = (titulo, headers, indices, maxLen, rowsSource) => {
                                const dataRows = (rowsSource || rows).slice(0, 15);
                                const totalTableH = (1 + dataRows.length) * lineH;
                                const sectionH = 4 + 4 + totalTableH + 3;
                                if (y + sectionH > yMax) {
                                    doc.addPage();
                                    y = 10;
                                }
                                y += 4;
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
                                y += 3;
                            };

                            const rowsClam = rows.filter((r) => {
                                const nClam = toNum(r[14]);
                                return !isNaN(nClam) && nClam > 0;
                            });
                            const rowsJarras = rows.filter((r) => {
                                const nJarra = toNum(r[15]);
                                const hasTiempoJarra = [20, 21, 22, 23, 24, 25].some((ix) => String(r[ix] == null ? '' : r[ix]).trim() !== '');
                                return !isNaN(nJarra) && nJarra > 0 && hasTiempoJarra;
                            });
                            drawTable('1. Tiempo de llenado de jarras (hora)', ['ITEM', 'N° JARRA', 'INICIO COSECHA', 'TÉRMINO COSECHA', 'TIEMPO (min)', 'INICIO TRASLADO', 'TÉRMINO TRASLADO', 'TIEMPO TRASL. (min)'], [14, 15, 20, 21, 22, 23, 24, 25], undefined, rowsJarras);
                            drawTable('2. Entrada de pesos: Visual', ['N° CLAM', 'N° JARRA', 'PESO 1 (g)', 'PESO 2 (g)', 'LLEGADA ACOPIO (g)', 'DESPACHO ACOPIO (g)'], [14, 15, 16, 17, 18, 19], undefined, rowsClam);
                            drawTable('3. Tiempos de la muestra (hora)', ['N° CLAM', 'INICIO COSECHA', 'PÉRDIDA PESO', 'TÉRMINO COSECHA', 'LLEGADA ACOPIO', 'DESPACHO ACOPIO'], [14, 34, 35, 36, 37, 38], undefined, rowsClam);
                            drawTable('4. Temperatura muestra (°C)', ['N° CLAM', 'INICIO AMB.', 'INICIO PULPA', 'TÉRMINO AMB.', 'TÉRMINO PULPA', 'LLEGADA AMB.', 'LLEGADA PULPA', 'DESP. AMB.', 'DESP. PULPA'], [14, 26, 27, 28, 29, 30, 31, 32, 33], undefined, rowsClam);
                            drawTable('5. Humedad relativa (%)', ['N° CLAM', 'INICIO', 'TÉRMINO', 'LLEGADA ACOPIO', 'DESPACHO ACOPIO'], [14, 39, 40, 41, 42], undefined, rowsClam);
                            drawTable('6. Presión de vapor ambiente (Kpa)', ['N° CLAM', 'INICIO', 'TÉRMINO', 'LLEGADA ACOPIO', 'DESPACHO ACOPIO'], [14, 43, 44, 45, 46], undefined, rowsClam);
                            drawTable('7. Presión de vapor fruta (Kpa)', ['N° CLAM', 'INICIO', 'TÉRMINO', 'LLEGADA ACOPIO', 'DESPACHO ACOPIO'], [14, 47, 48, 49, 50], undefined, rowsClam);
                            drawTable('8. Observaciones por muestra', ['N° CLAM', 'DETALLE DE LA OBSERVACIÓN'], [14, 51], [8, 45], rowsClam);
                        };

                        const gruposPorEnsayo = (ensayosAIncluir || [])
                            .map(function (n) {
                                const key = String(n);
                                const rowsEns = allRows.filter(function (r) { return String(r[12]) === key; });
                                return { key: key, rows: rowsEns };
                            })
                            .filter(function (g) { return g.rows.length > 0; });
                        const grupos = gruposPorEnsayo.length > 0 ? gruposPorEnsayo : [{ key: 'all', rows: allRows.slice() }];
                        grupos.forEach(function (g, idx) {
                            renderEnsayoPdf(g.rows, idx === 0);
                        });
                        const r0 = allRows[0] || [];

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
                                    const header = datosDelTipo[numE] && datosDelTipo[numE].formHeader;
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
                        var htmlEnviando = '<div class="registro-toast registro-toast--enviando" role="status"><span class="registro-toast__spinner" aria-hidden="true"></span><div class="registro-toast__msg"><strong>Enviando al servidor</strong><br>' +
                            'Tipo: <strong>Campo (' + String(tipoMedicion || '').toUpperCase() + ')</strong><br>' +
                            'Ensayo(s): <strong>' + ensayosAIncluir.join(', ') + '</strong><br>' +
                            'Filas a guardar: <strong>' + rowsToSave.length + '</strong><br>' +
                            '<span class="registro-toast__hint">No cierres la pestaña hasta que termine</span></div></div>';
                        Swal.fire({
                            toast: true,
                            position: 'bottom',
                            icon: false,
                            showConfirmButton: false,
                            showCloseButton: false,
                            html: htmlEnviando,
                            customClass: { popup: 'swal-registro-toast swal-registro-toast--info swal-registro-toast--enviando-wide' }
                        });
                        var avisoDemoraTimer = setTimeout(function () {
                            try {
                                var p = document.querySelector('.swal-registro-toast .registro-toast__msg');
                                if (p) p.textContent = 'Sigue enviando…';
                            } catch (_) {}
                        }, 12000);
                        lastSaveAt = Date.now();
                        const uid = saveLocal({ rows: rowsToSave });
                        const ESPERA_CONFIRMACION_MS = 90000;
                        const esperarHastaRegistrado = (id, maxMs) => new Promise((resolve) => {
                            const start = Date.now();
                            const check = () => {
                                const items = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
                                const item = items.find(i => i.uid === id);
                                if (!item || item.status !== 'pendiente') {
                                    resolve(true);
                                    return;
                                }
                                if (!navigator.onLine) {
                                    resolve(false);
                                    return;
                                }
                                if (Date.now() - start >= maxMs) {
                                    resolve(false);
                                    return;
                                }
                                setTimeout(check, 350);
                            };
                            check();
                        });
                        let registroConfirmado = !navigator.onLine;
                        try {
                            if (uid && navigator.onLine) {
                                registroConfirmado = await esperarHastaRegistrado(uid, ESPERA_CONFIRMACION_MS);
                            }
                        } finally {
                            try { clearTimeout(avisoDemoraTimer); } catch (_) {}
                            Swal.close();
                            toggleSaving(false);
                        }
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
                        if (uid) {
                            const limpiarFormularioDespuesDeGuardar = () => {
                                var tipoAntes = tipoMedicion;
                                if (tipoAntes && datosEnsayos[tipoAntes]) {
                                    [1, 2, 3, 4].forEach(function (numE) {
                                        datosEnsayos[tipoAntes][numE] = {
                                            formHeader: null,
                                            visual: [],
                                            jarras: [],
                                            temperaturas: [],
                                            tiempos: [],
                                            humedad: [],
                                            presionambiente: [],
                                            presionfruta: [],
                                            observacion: []
                                        };
                                    });
                                }
                                const formEl = document.getElementById('cosecha-form');
                                if (formEl) formEl.reset();
                                var selTipo = document.getElementById('tipo_medicion');
                                if (selTipo && tipoAntes) selTipo.value = tipoAntes;
                                var limpiarValor = function (id, valor) {
                                    var el = document.getElementById(id);
                                    if (!el) return;
                                    el.value = (valor == null ? '' : valor);
                                    try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
                                };
                                limpiarValor('reg_fecha', '');
                                limpiarValor('reg_responsable', RESPONSABLE_CAMPO_PREDETERMINADO);
                                limpiarValor('reg_guia_remision', '');
                                limpiarValor('reg_variedad', '');
                                limpiarValor('reg_placa', '');
                                limpiarValor('reg_hora_inicio', '');
                                limpiarValor('reg_dias_precosecha', '');
                                limpiarValor('reg_traz_libre', '');
                                limpiarValor('reg_fundo', '');
                                sincronizarTrazabilidadRegCampo({});
                                limpiarValor('reg_observacion_formato', '');
                                if (selTipo && tipoAntes) {
                                    try { selTipo.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
                                }
                            };
                            window.formHasChanges = false;
                            if (typeof renderHistorial === 'function') renderHistorial(false);
                            if (navigator.onLine) {
                                if (registroConfirmado) {
                                    await Swal.fire({
                                        title: 'Registro guardado correctamente',
                                        html: 'Se registró en servidor el formato de <strong>Campo (' + String(tipoMedicion || '').toUpperCase() + ')</strong>.<br><br>' +
                                            '<strong>Ensayo(s):</strong> ' + ensayosAIncluir.join(', ') + '<br>' +
                                            '<strong>Filas guardadas:</strong> ' + rowsToSave.length,
                                        icon: 'success',
                                        confirmButtonText: 'OK',
                                        confirmButtonColor: '#2f7cc0'
                                    });
                                    limpiarFormularioDespuesDeGuardar();
                                    const rotulo = document.getElementById('reg_rotulo_ensayo');
                                    if (rotulo) rotulo.value = '1';
                                    restaurarDatosEnsayo(tipoMedicion, 1);
                                } else {
                                    await Swal.fire({
                                        toast: true,
                                        position: 'bottom',
                                        icon: 'info',
                                        title: 'En cola',
                                        text: 'Revisa Pendientes.',
                                        showConfirmButton: false,
                                        timer: 2800,
                                        timerProgressBar: true,
                                        customClass: { popup: 'swal-registro-toast swal-registro-toast--cola' }
                                    });
                                }
                                updateUI();
                            } else {
                                Swal.fire({
                                    toast: true,
                                    position: 'bottom',
                                    icon: 'info',
                                    title: 'En cola',
                                    text: 'Sin conexión.',
                                    showConfirmButton: false,
                                    timer: 2600,
                                    timerProgressBar: true,
                                    customClass: { popup: 'swal-registro-toast swal-registro-toast--offline' }
                                });
                                limpiarFormularioDespuesDeGuardar();
                                const rotulo = document.getElementById('reg_rotulo_ensayo');
                                if (rotulo) rotulo.value = '1';
                                restaurarDatosEnsayo(tipoMedicion, 1);
                                updateUI();
                            }
                        }
                    } else if (result.isDenied) {
                        const pdfResult = generarPDF();
                        if (pdfResult && pdfResult.blobUrl) {
                            mostrarVistaPreviaPdf(pdfResult.blobUrl, pdfResult.nombreArchivo);
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
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}