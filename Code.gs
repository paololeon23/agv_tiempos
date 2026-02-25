/**
 * Google Apps Script - MTTP Arándano
 * Recibe datos del formulario y los escribe en la hoja activa.
 * 52 columnas (FUNDO, OBSERVACION_FORMATO; sin TEMP_AMB_*).
 *
 * ANTI-DUPLICADOS (evita réplicas por fallas de internet o reintentos):
 * 1) Idempotencia por UID: si el mismo envío (uid) ya se procesó, no se inserta de nuevo.
 * 2) Clave de fila: cada fila existente tiene una clave normalizada; si la fila ya está, no se inserta.
 * Así, aunque el mismo registro se envíe varias veces, solo se guarda una vez.
 *
 * --- LÓGICA PACKING (columnas 53+) ---
 * GET con fecha + ensayo_numero → devuelve data.fila = número de fila en la hoja (ej. 7).
 * POST con mode:'packing' + fecha + ensayo_numero + packingRows → escribe en ESA fila desde col 53 (tras 52 cols de registro).
 * Orden: col 53 = HORA_RECEPCION, 54 = N_VIAJE, 55+ = packing fila 1, fila 2, ... (41 valores por fila).
 */
function doPost(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "Sin datos POST" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "Servidor ocupado, reintenta" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  try {
    // En Web App no hay "hoja activa" del usuario; usar la primera hoja del libro para que siempre escribamos en la misma.
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    const data = JSON.parse(e.postData.contents);

    // POST PACKING: misma fila que fecha+ensayo, desde columna 53 (registro = 52 cols)
    if (data.mode === 'packing') {
      var packingResult = doPostPacking(sheet, data);
      lock.releaseLock();
      return ContentService.createTextOutput(JSON.stringify(packingResult))
        .setMimeType(ContentService.MimeType.JSON)
        .setHeader('Access-Control-Allow-Origin', '*');
    }

    const rows = data.rows || [];
    const uid = data.uid || null;

    // Log para depuración (visible en Ejecuciones de Apps Script)
    console.log("[doPost] Recibidas " + (rows ? rows.length : 0) + " filas. Resumen: " + (rows.length ? rows.map(function(r, i) { return "f" + (i + 1) + " ensayo=" + (r[12]) + " n_clamshell=" + (r[14]); }).join(", ") : "ninguna"));

    if (rows.length === 0) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "Sin filas" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ==== IDEMPOTENCIA POR UID ====
    // Si este mismo envío (uid) ya se procesó, no insertar de nuevo (evita réplicas por reintentos de red)
    if (uid) {
      var props = PropertiesService.getScriptProperties();
      var keyUid = "mtpp_uid_" + uid;
      if (props.getProperty(keyUid) === "1") {
        lock.releaseLock();
        return ContentService.createTextOutput(JSON.stringify({
          ok: true,
          received: rows.length,
          inserted: 0,
          duplicate: true,
          message: "Registro ya procesado anteriormente (evitado duplicado)"
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    if (sheet.getLastRow() === 0) {
      const headers = [
        "FECHA", "RESPONSABLE", "GUIA_REMISION", "VARIEDAD", "PLACA_VEHICULO", "HORA_INICIO_GENERAL", "DIAS_PRECOSECHA",
        "TRAZ_ETAPA", "TRAZ_CAMPO", "TRAZ_LIBRE", "FUNDO", "OBSERVACION_FORMATO", "ENSAYO_NUMERO", "ENSAYO_NOMBRE", "N_CLAMSHELL", "N_JARRA",
        "PESO_1", "PESO_2", "LLEGADA_ACOPIO", "DESPACHO_ACOPIO", "INICIO_C", "TERMINO_C", "MIN_C", "INICIO_T", "TERMINO_T", "MIN_T",
        "TEMP_MUE_INICIO_AMB", "TEMP_MUE_INICIO_PUL", "TEMP_MUE_TERMINO_AMB", "TEMP_MUE_TERMINO_PUL",
        "TEMP_MUE_LLEGADA_AMB", "TEMP_MUE_LLEGADA_PUL", "TEMP_MUE_DESPACHO_AMB", "TEMP_MUE_DESPACHO_PUL",
        "TIEMPO_INICIO_COSECHA", "TIEMPO_PERDIDA_PESO", "TIEMPO_TERMINO_COSECHA", "TIEMPO_LLEGADA_ACOPIO", "TIEMPO_DESPACHO_ACOPIO",
        "HUMEDAD_INICIO", "HUMEDAD_TERMINO", "HUMEDAD_LLEGADA", "HUMEDAD_DESPACHO",
        "PRESION_AMB_INICIO", "PRESION_AMB_TERMINO", "PRESION_AMB_LLEGADA", "PRESION_AMB_DESPACHO",
        "PRESION_FRUTA_INICIO", "PRESION_FRUTA_TERMINO", "PRESION_FRUTA_LLEGADA", "PRESION_FRUTA_DESPACHO",
        "OBSERVACION"
      ];
      sheet.appendRow(headers);
    }

    const NUM_COLS = 52;

    // Normalizar valor para la clave (hoja devuelve Date/number, el POST envía string)
    function normalizarParaClave(v) {
      if (v === null || v === undefined) return "";
      if (v instanceof Date) return Utilities.formatDate(v, "America/Santiago", "yyyy-MM-dd");
      var s = String(v).trim();
      return s;
    }

    function buildKey(row) {
      return row.slice(0, NUM_COLS).map(normalizarParaClave).join("||");
    }

    // Solo evitamos duplicados por clave completa de fila (misma fecha+ensayo+n_clamshell+datos). Permitimos varias filas por (fecha, ensayo).
    var lastRow = sheet.getLastRow();
    var existingKeys = {};
    if (lastRow >= 2) {
      var existingValues = sheet.getRange(2, 1, lastRow - 1, NUM_COLS).getValues();
      existingValues.forEach(function(r) {
        var key = buildKey(r);
        if (key) existingKeys[key] = true;
      });
    }

    // Escribir todo como string para que Sheets no interprete números (ej. 1) como hora (0:00)
    function celdaAString(cell) {
      if (cell === null || cell === undefined) return "";
      return String(cell);
    }
    var nuevasFilas = [];
    rows.forEach(function(row) {
      while (row.length < NUM_COLS) row.push("");
      var fila = row.slice(0, NUM_COLS).map(celdaAString);
      var key = buildKey(fila);
      if (existingKeys[key]) return;
      nuevasFilas.push(fila);
      existingKeys[key] = true;
    });

    // Re-leer la hoja justo antes de escribir (por si otro request escribió mientras esperaba el lock)
    lastRow = sheet.getLastRow();
    existingKeys = {};
    if (lastRow >= 2) {
      existingValues = sheet.getRange(2, 1, lastRow - 1, NUM_COLS).getValues();
      existingValues.forEach(function(r) {
        var key = buildKey(r);
        if (key) existingKeys[key] = true;
      });
      var filtradas = [];
      nuevasFilas.forEach(function(fila) {
        var key = buildKey(fila);
        if (existingKeys[key]) return;
        filtradas.push(fila);
        existingKeys[key] = true;
      });
      nuevasFilas = filtradas;
    }

    if (nuevasFilas.length > 0) {
      var startRow = sheet.getLastRow() + 1;
      var numRows = nuevasFilas.length;
      sheet.getRange(startRow, 1, numRows, NUM_COLS).setValues(nuevasFilas);
      console.log("[doPost] Insertadas " + numRows + " filas desde fila " + startRow);
    }

    if (nuevasFilas.length === 0 && rows.length > 0) {
      return ContentService.createTextOutput(JSON.stringify({
        ok: false,
        error: "No se insertó ninguna fila: todas coinciden con registros ya existentes (clave duplicada).",
        duplicate: true
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (uid) {
      PropertiesService.getScriptProperties().setProperty("mtpp_uid_" + uid, "1");
      limpiarUidsAntiguos();
    }

    return ContentService.createTextOutput(JSON.stringify({
      ok: true,
      received: rows.length,
      inserted: nuevasFilas.length
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

// Mantener solo los últimos ~500 UIDs para no llenar ScriptProperties
function limpiarUidsAntiguos() {
  try {
    var props = PropertiesService.getScriptProperties();
    var all = props.getProperties();
    var keys = [];
    for (var k in all) {
      if (k.indexOf("mtpp_uid_") === 0) keys.push(k);
    }
    if (keys.length <= 500) return;
    keys.sort();
    var eliminar = keys.length - 500;
    for (var i = 0; i < eliminar; i++) {
      props.deleteProperty(keys[i]);
    }
  } catch (e) {}
}

/** Normaliza fecha a yyyy-MM-dd para comparar con el front (igual que doGet). */
function formatFechaPacking(val) {
  if (val === null || val === undefined || val === '') return '';
  if (val instanceof Date) return Utilities.formatDate(val, "GMT", "yyyy-MM-dd");
  var s = String(val).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var d = null;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    var parts = s.split('/');
    var day = parseInt(parts[0], 10);
    var month = parseInt(parts[1], 10) - 1;
    var year = parseInt(parts[2], 10);
    if (year >= 1900 && year <= 2100 && month >= 0 && month <= 11 && day >= 1 && day <= 31) d = new Date(year, month, day);
  } else if (s.indexOf('GMT') >= 0 || /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s/.test(s)) d = new Date(s);
  if (d && !isNaN(d.getTime())) return Utilities.formatDate(d, "GMT", "yyyy-MM-dd");
  return s;
}

/**
 * Nombres de columnas packing (en base a los id del formulario). 41 nombres por fila lógica.
 * Orden: p1(5), p2(5), p3(10), p4-humedad(5), p5-presion_amb(5), p6-presion_fruta(5), p7-deficit(5), p8(1).
 */
function getPackingHeaderNamesPerRow() {
  return [
    'RECEPCION', 'INGRESO_GASIFICADO', 'SALIDA_GASIFICADO', 'INGRESO_PREFRIO', 'SALIDA_PREFRIO',
    'PESO_RECEPCION', 'PESO_INGRESO_GASIFICADO', 'PESO_SALIDA_GASIFICADO', 'PESO_INGRESO_PREFRIO', 'PESO_SALIDA_PREFRIO',
    'T_AMB_RECEP', 'T_PULP_RECEP', 'T_AMB_ING', 'T_PULP_ING', 'T_AMB_SAL', 'T_PULP_SAL', 'T_AMB_PRE_IN', 'T_PULP_PRE_IN', 'T_AMB_PRE_OUT', 'T_PULP_PRE_OUT',
    'HUMEDAD_RECEPCION', 'HUMEDAD_INGRESO_GASIFICADO', 'HUMEDAD_SALIDA_GASIFICADO', 'HUMEDAD_INGRESO_PREFRIO', 'HUMEDAD_SALIDA_PREFRIO',
    'PRESION_AMB_RECEPCION', 'PRESION_AMB_INGRESO_GASIFICADO', 'PRESION_AMB_SALIDA_GASIFICADO', 'PRESION_AMB_INGRESO_PREFRIO', 'PRESION_AMB_SALIDA_PREFRIO',
    'PRESION_FRUTA_RECEPCION', 'PRESION_FRUTA_INGRESO_GASIFICADO', 'PRESION_FRUTA_SALIDA_GASIFICADO', 'PRESION_FRUTA_INGRESO_PREFRIO', 'PRESION_FRUTA_SALIDA_PREFRIO',
    'DEFICIT_RECEPCION', 'DEFICIT_INGRESO_GASIFICADO', 'DEFICIT_SALIDA_GASIFICADO', 'DEFICIT_INGRESO_PREFRIO', 'DEFICIT_SALIDA_PREFRIO',
    'OBSERVACION'
  ];
}

/** Devuelve el array de encabezados para columnas 53+: HORA_RECEPCION, N_VIAJE, luego por cada fila los 41 nombres con sufijo _1, _2, ... */
function getPackingHeaderNames(numFilas) {
  var out = ['HORA_RECEPCION', 'N_VIAJE'];
  var base = getPackingHeaderNamesPerRow();
  for (var f = 1; f <= numFilas; f++) {
    var suffix = '_' + f;
    for (var i = 0; i < base.length; i++) out.push(base[i] + suffix);
  }
  return out;
}

/**
 * POST Packing: recibe mode:'packing', fecha, ensayo_numero, hora_recepcion, n_viaje, packingRows.
 * Localiza TODAS las filas de la hoja para esa fecha+ensayo y escribe UNA fila de packing por cada fila de hoja (col 53+).
 * packingRows[0] → primera fila del ensayo, packingRows[1] → segunda, etc. (cada una: 41 valores + HORA_RECEPCION + N_VIAJE = 43 cols).
 */
function doPostPacking(sheet, data) {
  try {
    var fecha = (data.fecha != null && data.fecha !== '') ? String(data.fecha).trim() : '';
    var ensayoNumero = (data.ensayo_numero != null && data.ensayo_numero !== '') ? String(data.ensayo_numero).trim() : '';
    var horaRecepcion = (data.hora_recepcion != null && data.hora_recepcion !== '') ? String(data.hora_recepcion).trim() : '';
    var nViaje = (data.n_viaje != null && data.n_viaje !== '') ? String(data.n_viaje).trim() : '';
    var packingRows = data.packingRows || [];

    if (!fecha || !ensayoNumero) {
      return { ok: false, error: 'Faltan fecha o ensayo_numero' };
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return { ok: false, error: 'No hay datos en la hoja' };
    }

    // Obtener TODAS las filas de la hoja que coinciden con fecha+ensayo (col M = índice 12)
    var dataRows = sheet.getRange(2, 1, lastRow - 1, 13).getValues();
    var rowIndices = [];
    for (var k = 0; k < dataRows.length; k++) {
      var r = dataRows[k];
      var rowFechaStr = formatFechaPacking(r[0]);
      var rowEn = (r[12] != null && r[12] !== '') ? String(r[12]).trim() : '';
      if (rowFechaStr === fecha && rowEn === ensayoNumero) {
        rowIndices.push(2 + k);
      }
    }
    if (rowIndices.length === 0) {
      return { ok: false, error: 'No se encontró ninguna fila para esa fecha y ensayo' };
    }

    var startCol = 53;
    var COLS_POR_FILA = 2 + 41; // HORA_RECEPCION, N_VIAJE + 41 valores por fila lógica
    var baseHeaders = ['HORA_RECEPCION', 'N_VIAJE'].concat(getPackingHeaderNamesPerRow());

    // Escribir cada packing row en la fila de hoja correspondiente (una fila de hoja por cada packing row)
    for (var i = 0; i < packingRows.length && i < rowIndices.length; i++) {
      var row = packingRows[i];
      var filaHoja = rowIndices[i];
      var valores = [horaRecepcion, nViaje];
      if (Array.isArray(row)) {
        for (var j = 0; j < 41; j++) {
          valores.push((j < row.length && row[j] != null && row[j] !== '') ? row[j] : '');
        }
      } else {
        for (var j = 0; j < 41; j++) valores.push('');
      }
      sheet.getRange(filaHoja, startCol, 1, COLS_POR_FILA).setValues([valores]);
    }

    // Encabezados en fila 1 (una sola vez; 43 columnas)
    sheet.getRange(1, startCol, 1, baseHeaders.length).setValues([baseHeaders]);

    return {
      ok: true,
      message: 'Packing guardado en ' + Math.min(packingRows.length, rowIndices.length) + ' fila(s)',
      filasEscritas: Math.min(packingRows.length, rowIndices.length),
      packingMuestras: packingRows.length
    };
  } catch (err) {
    return { ok: false, error: err.toString() };
  }
}

/**
 * GET: dos parámetros (fecha + ensayo_numero) para sacar la info y llenar el front.
 * - fecha: yyyy-mm-dd (ej. 2026-02-17)
 * - ensayo_numero: "1", "2", "3" o "4" (columna M, índice 12)
 * Devuelve: { ok: true, data: { ... } } y fechas siempre en formato ["2026-02-17"].
 *
 * IMPORTANTE: Después de editar este archivo, en Apps Script ve a Implementar > Gestionar implementaciones >
 * Editar la implementación activa > Versión: "Nueva versión" > Implementar. Si no, la Web App sigue con la versión vieja.
 *
 * Otros modos: sin params → fechas; solo fecha → ensayos.
 */
function doGet(e) {
  var result = { ok: false, data: null, error: null, fechas: null, ensayos: null };
  try {
    var params = e && e.parameter ? e.parameter : {};
    var fecha = (params.fecha || '').toString().trim();
    var ensayoNumero = (params.ensayo_numero || '').toString().trim();
    var callback = (params.callback || '').toString().trim();
    if (!/^[a-zA-Z0-9_]+$/.test(callback)) callback = '';

    function returnOutput(obj) {
      if (callback) return outputJsonp(obj, callback);
      return outputJson(obj);
    }

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      result.error = 'No hay datos en la hoja';
      return returnOutput(result);
    }

    var data = sheet.getRange(2, 1, lastRow - 1, 14).getValues();

    /**
     * SIEMPRE devuelve yyyy-MM-dd (nunca "Tue Feb 17 2026 GMT-0500..."). Así Netlify recibe fechas cortas.
     * Acepta: Date, string yyyy-MM-dd, dd/MM/yyyy, o string largo tipo "Tue Feb 17 2026 00:00:00 GMT-0500".
     */
    function formatFecha(val) {
      if (val === null || val === undefined || val === '') return '';
      if (val instanceof Date) return Utilities.formatDate(val, "GMT", "yyyy-MM-dd");
      var s = String(val).trim();
      if (!s) return '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      var d = null;
      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
        var parts = s.split('/');
        var day = parseInt(parts[0], 10);
        var month = parseInt(parts[1], 10) - 1;
        var year = parseInt(parts[2], 10);
        if (year >= 1900 && year <= 2100 && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
          d = new Date(year, month, day);
        }
      } else if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(s)) {
        var parts2 = s.split('-');
        day = parseInt(parts2[0], 10);
        month = parseInt(parts2[1], 10) - 1;
        year = parseInt(parts2[2], 10);
        if (year >= 1900 && year <= 2100 && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
          d = new Date(year, month, day);
        }
      } else if (s.indexOf('GMT') >= 0 || /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s/.test(s)) {
        d = new Date(s);
      }
      if (d && !isNaN(d.getTime())) return Utilities.formatDate(d, "GMT", "yyyy-MM-dd");
      return s;
    }

    // 0) Listado de todos los registros (fecha + ensayo) para historial y prevención — una petición, respuesta ligera
    var listadoReg = (params.listado_registrados || '').toString().trim() === '1';
    if (listadoReg) {
      var seen = {};
      var registrados = [];
      for (var i = 0; i < data.length; i++) {
        var r = data[i];
        var f = formatFecha(r[0]);
        var en = r[12];
        var enStr = (en !== null && en !== undefined && en !== '') ? (Number(en) === Math.floor(Number(en)) ? String(Number(en)) : String(en).trim()) : '';
        var nom = (r[13] != null && r[13] !== undefined && r[13] !== '') ? String(r[13]).trim() : ('Ensayo ' + enStr);
        if (!f || enStr === '') continue;
        var key = f + '|' + enStr;
        if (seen[key]) continue;
        seen[key] = true;
        registrados.push({ fecha: f, ensayo_numero: enStr, ensayo_nombre: nom });
      }
      result.ok = true;
      result.registrados = registrados;
      return returnOutput(result);
    }

    // 1) Listar fechas con datos (sin fecha ni ensayo_numero)
    if (!fecha && !ensayoNumero) {
      var fechasSet = {};
      for (var i = 0; i < data.length; i++) {
        var f = formatFecha(data[i][0]);
        if (f) fechasSet[f] = true;
      }
      var fechasList = Object.keys(fechasSet).sort().reverse();
      result.ok = true;
      result.fechas = fechasList;
      return returnOutput(result);
    }

    // 2) Listar ensayos para una fecha (solo fecha) — devuelve números de ensayo (col M = índice 12)
    if (fecha && !ensayoNumero) {
      var ensayosSet = {};
      for (var j = 0; j < data.length; j++) {
        var rowFechaStr = formatFecha(data[j][0]);
        if (rowFechaStr === fecha) {
          var en = String(data[j][12] || '').trim();
          if (en) ensayosSet[en] = true;
        }
      }
      var ensayosList = Object.keys(ensayosSet).sort();
      result.ok = true;
      result.ensayos = ensayosList;
      return returnOutput(result);
    }

    // 3) Comprobar si ya existe registro para esta fecha + ensayo_numero (col M = índice 12)
    var existeRegistro = (params.existe_registro || '').toString().trim() === '1';
    if (existeRegistro && fecha && ensayoNumero) {
      var enNorm = ensayoNumero;
      var numEn = Number(ensayoNumero);
      if (!isNaN(numEn) && numEn === Math.floor(numEn)) enNorm = String(numEn);
      for (var i = 0; i < data.length; i++) {
        var r = data[i];
        var rowFechaStr = formatFecha(r[0]);
        var rowEn = r[12];
        var rowEnStr = (rowEn !== null && rowEn !== undefined) ? (Number(rowEn) === Math.floor(Number(rowEn)) ? String(Number(rowEn)) : String(rowEn).trim()) : '';
        if (rowFechaStr === fecha && rowEnStr === enNorm) {
          result.ok = true;
          result.existe = true;
          result.ensayo_numero = enNorm;
          return returnOutput(result);
        }
      }
      result.ok = true;
      result.existe = false;
      return returnOutput(result);
    }

    // 4) Obtener fila por fecha + ensayo_numero (col M = índice 12: 1, 2, 3, 4) y numFilas para Packing
    if (!fecha || !ensayoNumero) {
      result.error = 'Faltan parámetros: fecha y ensayo_numero';
      return returnOutput(result);
    }

    var row = null;
    var filaEnSheet = null;
    var numFilas = 0;
    for (var k = 0; k < data.length; k++) {
      var r = data[k];
      var rowFechaStr = formatFecha(r[0]);
      var rowNum = String(r[12] != null ? r[12] : '').trim();
      if (rowFechaStr === fecha && rowNum === ensayoNumero) {
        if (row == null) {
          row = r;
          filaEnSheet = 2 + k;
        }
        numFilas++;
      }
    }

    if (!row) {
      result.error = 'No hay registro para esa fecha y ensayo';
      return returnOutput(result);
    }

    result.ok = true;
    result.data = {
      fila: filaEnSheet,
      numFilas: numFilas,
      ENSAYO_NUMERO: row[12],
      TRAZ_ETAPA: row[7],
      TRAZ_CAMPO: row[8],
      TRAZ_LIBRE: row[9],
      VARIEDAD: row[3],
      PLACA_VEHICULO: row[4],
      GUIA_REMISION: row[2]
    };
    return returnOutput(result);
  } catch (err) {
    result.error = err.toString();
    return returnOutput(result);
  }
}

function outputJson(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Respuesta JSONP para evitar CORS cuando el front llama con ?callback=nombre */
function outputJsonp(obj, callbackName) {
  var body = callbackName + '(' + JSON.stringify(obj) + ')';
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JAVASCRIPT);
}