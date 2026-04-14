/**
 * Google Apps Script - MTTP Arándano
 * Recibe datos del formulario y los escribe en la hoja activa.
 * Hoja 1: 46 cols registro + 40 packing + Thermo King (39 cols: 2 meta + 37 datos) + Recepción C5.
 *
 * ANTI-DUPLICADOS: UID + clave de fila normalizada.
 *
 * --- PACKING (cols 47–86) ---
 * GET → data.fila y despachoPorFila. POST packing → escribe desde col 47.
 */
var PACKING_START_COL = 47; // 40 columnas (47..86)
var PACKING_COLS = 40;
var THERMOKING_START_COL = PACKING_START_COL + PACKING_COLS; // 87 (CI)
/** Debe coincidir con getThermokingFlatHeaders().length (2 meta + 37 datos). */
var THERMOKING_COLS = 39;
var C5_START_COL = THERMOKING_START_COL + THERMOKING_COLS; // 126

/** Número de columnas del bloque Thermo en hoja (evita desfase GET/POST). */
function getThermokingSheetColumnCount_() {
  return getThermokingFlatHeaders().length;
}

/** Una fila de muestra Thermo King: FECHA/RESP meta + HORA/PLACA + tiempos + peso + temp + humedad + presión + vapor + obs. */
function getThermokingFlatHeaders() {
  return [
    'FECHA_INSPECCION_THERMOKING',
    'RESPONSABLE_THERMOKING',
    'HORA_SALIDA_THERMOKING',
    'PLACA_THERMOKING',
    'THERMOKING_TIEMPO_INGRESO_CAMARA',
    'THERMOKING_TIEMPO_SALIDA_CAMARA',
    'THERMOKING_TIEMPO_INICIO_TRASLADO',
    'THERMOKING_TIEMPO_DESPACHO',
    'THERMOKING_PESO_INGRESO_CAMARA',
    'THERMOKING_PESO_SALIDA_TRASLADO',
    'THERMOKING_PESO_INICIO_TRASLADO',
    'THERMOKING_PESO_DESPACHO',
    'THERMOKING_TEMP_IC_CM',
    'THERMOKING_TEMP_IC_PULPA',
    'THERMOKING_TEMP_ST_CM',
    'THERMOKING_TEMP_ST_PULPA',
    'THERMOKING_TEMP_TRASLADO_AMB',
    'THERMOKING_TEMP_TRASLADO_VEHICULO',
    'THERMOKING_TEMP_TRASLADO_PULPA',
    'THERMOKING_TEMP_DESPACHO_AMB',
    'THERMOKING_TEMP_DESPACHO_VEHICULO',
    'THERMOKING_TEMP_DESPACHO_PULPA',
    'THERMOKING_HUM_INGRESO_CAMARA',
    'THERMOKING_HUM_SALIDA_TRASLADO',
    'THERMOKING_HUM_AMB_EXT_INICIO',
    'THERMOKING_HUM_INT_VEH_INICIO',
    'THERMOKING_HUM_AMB_EXT_DESPACHO',
    'THERMOKING_HUM_INT_VEH_DESPACHO',
    'THERMOKING_PRESION_INGRESO_CAMARA',
    'THERMOKING_PRESION_SALIDA_TRASLADO',
    'THERMOKING_PRESION_AMB_EXT_INICIO',
    'THERMOKING_PRESION_INT_VEH_INICIO',
    'THERMOKING_PRESION_AMB_EXT_DESPACHO',
    'THERMOKING_PRESION_INT_VEH_DESPACHO',
    'THERMOKING_VAPOR_INGRESO_CAMARA',
    'THERMOKING_VAPOR_SALIDA_CAMARA',
    'THERMOKING_VAPOR_INICIO_TRASLADO',
    'THERMOKING_VAPOR_SALIDA_TRASLADO',
    'THERMOKING_OBSERVACION'
  ];
}

/** Recepción C5: 2 meta + mismos 36 campos de datos que una fila packing (sin JSON). */
function getC5FlatHeaders() {
  return [
    'HORA_INICIO_RECEPCION_C5',
    'PLACA_C5',
    'C5_RECEPCION',
    'C5_INGRESO_GASIFICADO',
    'C5_SALIDA_GASIFICADO',
    'C5_INGRESO_PREFRIO',
    'C5_SALIDA_PREFRIO',
    'C5_PESO_RECEPCION',
    'C5_PESO_INGRESO_GASIFICADO',
    'C5_PESO_SALIDA_GASIFICADO',
    'C5_PESO_INGRESO_PREFRIO',
    'C5_PESO_SALIDA_PREFRIO',
    'C5_T_AMB_RECEP',
    'C5_T_PULP_RECEP',
    'C5_T_AMB_ING',
    'C5_T_PULP_ING',
    'C5_T_AMB_SAL',
    'C5_T_PULP_SAL',
    'C5_T_AMB_PRE_IN',
    'C5_T_PULP_PRE_IN',
    'C5_T_AMB_PRE_OUT',
    'C5_T_PULP_PRE_OUT',
    'C5_HUMEDAD_RECEPCION',
    'C5_HUMEDAD_INGRESO_GASIFICADO',
    'C5_HUMEDAD_SALIDA_GASIFICADO',
    'C5_HUMEDAD_INGRESO_PREFRIO',
    'C5_HUMEDAD_SALIDA_PREFRIO',
    'C5_PRESION_AMB_RECEPCION',
    'C5_PRESION_AMB_INGRESO_GASIFICADO',
    'C5_PRESION_AMB_SALIDA_GASIFICADO',
    'C5_PRESION_AMB_INGRESO_PREFRIO',
    'C5_PRESION_AMB_SALIDA_PREFRIO',
    'C5_PRESION_FRUTA_RECEPCION',
    'C5_PRESION_FRUTA_INGRESO_GASIFICADO',
    'C5_PRESION_FRUTA_SALIDA_GASIFICADO',
    'C5_PRESION_FRUTA_INGRESO_PREFRIO',
    'C5_PRESION_FRUTA_SALIDA_PREFRIO',
    'C5_OBSERVACION'
  ];
}

function strCell_(v) {
  if (v === null || v === undefined) return '';
  return String(v);
}

/** True si alguna celda del array (una fila de getValues) tiene texto no vacío. */
function rowHasAnyNonEmpty_(arr) {
  if (!arr || !arr.length) return false;
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] != null && String(arr[i]).trim() !== '') return true;
  }
  return false;
}

/** Lee una fila horizontal [startCol .. startCol+numCols-1] (índices de columna 1-based). */
function getSheetRowValues_(sheet, row, startCol, numCols) {
  if (numCols <= 0 || row < 1) return [];
  var endCol = startCol + numCols - 1;
  return sheet.getRange(row, startCol, row, endCol).getValues()[0];
}

/** Escribe un array en una sola fila desde startCol. */
function setSheetRowValues_(sheet, row, startCol, arr) {
  if (!arr || !arr.length || row < 1) return;
  var endCol = startCol + arr.length - 1;
  sheet.getRange(row, startCol, row, endCol).setValues([arr]);
}

/** True si en esa fila de hoja hay al menos un valor en el rango [startCol .. startCol+numCols-1]. */
function rangeRowHasAnyValue_(sheet, row, startCol, numCols) {
  if (numCols <= 0 || row < 2) return false;
  try {
    var vals = getSheetRowValues_(sheet, row, startCol, numCols);
    return rowHasAnyNonEmpty_(vals);
  } catch (e) {
    return false;
  }
}

function pickField_(arr, i, key) {
  if (!Array.isArray(arr) || i < 0 || i >= arr.length) return '';
  var o = arr[i];
  if (!o || typeof o !== 'object') return '';
  return strCell_(o[key]);
}

/** Fila Thermo King índice i (alineada a la fila de hoja i del mismo ensayo). */
function buildThermokingFlatRow(data, i) {
  var fiTk = (data.fecha_inspeccion_thermoking != null && String(data.fecha_inspeccion_thermoking).trim() !== '') ? String(data.fecha_inspeccion_thermoking).trim() : '';
  if (!fiTk && data.fecha_inspeccion != null && String(data.fecha_inspeccion).trim() !== '') fiTk = String(data.fecha_inspeccion).trim();
  var respTk = (data.responsable_thermoking != null && String(data.responsable_thermoking).trim() !== '') ? String(data.responsable_thermoking).trim() : '';
  if (!respTk && data.responsable != null && String(data.responsable).trim() !== '') respTk = String(data.responsable).trim();
  var hora = (data.hora_salida_thermoking != null) ? String(data.hora_salida_thermoking).trim() : '';
  var placa = (data.placa_thermoking != null) ? String(data.placa_thermoking).trim() : '';
  var t = data.thermoking_tiempos || [];
  var p = data.thermoking_peso || [];
  var tem = data.thermoking_temp || [];
  var h = data.thermoking_humedad_tk || data.thermoking_humedad || [];
  var pr = data.thermoking_presion_tk || data.thermoking_presion || [];
  var v = data.thermoking_vapor || [];
  var obs = data.thermoking_obs || [];
  return [
    fiTk,
    respTk,
    hora,
    placa,
    pickField_(t, i, 'ic'),
    pickField_(t, i, 'st'),
    pickField_(t, i, 'it'),
    pickField_(t, i, 'dp'),
    pickField_(p, i, 'ic'),
    pickField_(p, i, 'st'),
    pickField_(p, i, 'it'),
    pickField_(p, i, 'dp'),
    pickField_(tem, i, 'ic_cm'),
    pickField_(tem, i, 'ic_pu'),
    pickField_(tem, i, 'st_cm'),
    pickField_(tem, i, 'st_pu'),
    pickField_(tem, i, 'it_amb'),
    pickField_(tem, i, 'it_veh'),
    pickField_(tem, i, 'it_pu'),
    pickField_(tem, i, 'd_amb'),
    pickField_(tem, i, 'd_veh'),
    pickField_(tem, i, 'd_pu'),
    pickField_(h, i, 'ic'),
    pickField_(h, i, 'st'),
    pickField_(h, i, 'aei'),
    pickField_(h, i, 'ivi'),
    pickField_(h, i, 'aed'),
    pickField_(h, i, 'ivd'),
    pickField_(pr, i, 'ic'),
    pickField_(pr, i, 'st'),
    pickField_(pr, i, 'aei'),
    pickField_(pr, i, 'ivi'),
    pickField_(pr, i, 'aed'),
    pickField_(pr, i, 'ivd'),
    pickField_(v, i, 'ic'),
    pickField_(v, i, 'scm'),
    pickField_(v, i, 'it'),
    pickField_(v, i, 'st'),
    pickField_(obs, i, 'observacion')
  ];
}

/** Fila Recepción C5 índice i (packing1_c5 … packing8_c5). */
function buildC5FlatRow(data, i) {
  var hora = (data.hora_inicio_recepcion_c5 != null) ? String(data.hora_inicio_recepcion_c5).trim() : '';
  var placa = (data.placa_c5 != null) ? String(data.placa_c5).trim() : '';
  var p1 = data.packing1_c5 || data.c5_tiempos || [];
  var p2 = data.packing2_c5 || data.c5_peso || [];
  var p3 = data.packing3_c5 || data.c5_temp || [];
  var p4 = data.packing4_c5 || data.c5_humedad || [];
  var p5 = data.packing5_c5 || data.c5_presion || [];
  var p6 = data.packing6_c5 || data.c5_presion_fruta || [];
  var p8 = data.packing8_c5 || data.c5_obs || [];
  return [
    hora,
    placa,
    pickField_(p1, i, 'recepcion'),
    pickField_(p1, i, 'ingreso_gasificado'),
    pickField_(p1, i, 'salida_gasificado'),
    pickField_(p1, i, 'ingreso_prefrio'),
    pickField_(p1, i, 'salida_prefrio'),
    pickField_(p2, i, 'peso_recepcion'),
    pickField_(p2, i, 'peso_ingreso_gasificado'),
    pickField_(p2, i, 'peso_salida_gasificado'),
    pickField_(p2, i, 'peso_ingreso_prefrio'),
    pickField_(p2, i, 'peso_salida_prefrio'),
    pickField_(p3, i, 't_amb_recep'),
    pickField_(p3, i, 't_pulp_recep'),
    pickField_(p3, i, 't_amb_ing'),
    pickField_(p3, i, 't_pulp_ing'),
    pickField_(p3, i, 't_amb_sal'),
    pickField_(p3, i, 't_pulp_sal'),
    pickField_(p3, i, 't_amb_pre_in'),
    pickField_(p3, i, 't_pulp_pre_in'),
    pickField_(p3, i, 't_amb_pre_out'),
    pickField_(p3, i, 't_pulp_pre_out'),
    pickField_(p4, i, 'recepcion'),
    pickField_(p4, i, 'ingreso_gasificado'),
    pickField_(p4, i, 'salida_gasificado'),
    pickField_(p4, i, 'ingreso_prefrio'),
    pickField_(p4, i, 'salida_prefrio'),
    pickField_(p5, i, 'recepcion'),
    pickField_(p5, i, 'ingreso_gasificado'),
    pickField_(p5, i, 'salida_gasificado'),
    pickField_(p5, i, 'ingreso_prefrio'),
    pickField_(p5, i, 'salida_prefrio'),
    pickField_(p6, i, 'recepcion'),
    pickField_(p6, i, 'ingreso_gasificado'),
    pickField_(p6, i, 'salida_gasificado'),
    pickField_(p6, i, 'ingreso_prefrio'),
    pickField_(p6, i, 'salida_prefrio'),
    pickField_(p8, i, 'observacion')
  ];
}

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

    // POST PACKING: misma fila que fecha+ensayo, desde columna 47 (registro = 46 cols en Hoja 1)
    if (data.mode === 'packing') {
      var packingResult = doPostPacking(sheet, data);
      lock.releaseLock();
      return ContentService.createTextOutput(JSON.stringify(packingResult))
        .setMimeType(ContentService.MimeType.JSON)
        .setHeader('Access-Control-Allow-Origin', '*');
    }
    // POST Recepción C5: misma fila lógica fecha+ensayo, bloque C5 a la derecha de Thermo King.
    if (data.mode === 'recepcion-c5' || data.mode === 'recepcion_c5') {
      var c5Result = doPostRecepcionC5(sheet, data);
      lock.releaseLock();
      return ContentService.createTextOutput(JSON.stringify(c5Result))
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
      // Hoja 1: 46 columnas. INICIO_C, TERMINO_C, MIN_C, INICIO_T, TERMINO_T, MIN_T van en Hoja 2.
      const headers = [
        "FECHA", "RESPONSABLE", "GUIA_REMISION", "VARIEDAD", "PLACA_VEHICULO", "HORA_INICIO_GENERAL", "DIAS_PRECOSECHA",
        "TRAZ_ETAPA", "TRAZ_CAMPO", "TRAZ_LIBRE", "FUNDO", "OBSERVACION_FORMATO", "ENSAYO_NUMERO", "ENSAYO_NOMBRE", "N_CLAMSHELL", "N_JARRA",
        "PESO_1", "PESO_2", "LLEGADA_ACOPIO", "DESPACHO_ACOPIO",
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

    const NUM_COLS = 46; // Hoja 1: registro. Las 6 de tiempos (INICIO_C..MIN_T) están en Hoja 2.

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

    function celdaAString(cell) {
      if (cell === null || cell === undefined) return "";
      return String(cell);
    }
    // Si el front envía 52 columnas, quitar índices 20-25 (INICIO_C..MIN_T) para escribir 46 en Hoja 1; esos 6 van a Hoja 2.
    function toRow46(row) {
      while (row.length < 52) row.push("");
      var a = row.slice(0, 20).concat(row.slice(26, 52));
      return a.slice(0, NUM_COLS).map(celdaAString);
    }
    function rowHoja2(fila, rowOriginal) {
      // Réplica en Hoja 2: FECHA, ENSAYO_NUMERO, N_JARRA; luego INICIO_C, TERMINO_C, MIN_C, INICIO_T, TERMINO_T, MIN_T (9 cols)
      var c = celdaAString;
      var out = [c(fila[0]), c(fila[12]), c(fila[15]), '', '', '', '', '', ''];
      if (rowOriginal && rowOriginal.length >= 26) {
        out[3] = c(rowOriginal[20]); out[4] = c(rowOriginal[21]); out[5] = c(rowOriginal[22]);
        out[6] = c(rowOriginal[23]); out[7] = c(rowOriginal[24]); out[8] = c(rowOriginal[25]);
      }
      return out;
    }
    // No agregar en Hoja 1 filas con N_CLAMSHELL=0 o PESO_1=0 o PESO_2=0. En Hoja 2 sí se agregan todas (incl. N_CLAMSHELL=0).
    function esCero(v) {
      if (v === null || v === undefined) return true;
      var s = String(v).trim();
      if (s === '') return true;
      var n = parseFloat(s.replace(',', '.'));
      return isNaN(n) || n === 0;
    }
    var nuevasFilas = [];
    var filasHoja2 = [];
    rows.forEach(function(row) {
      var fila = row.length >= 52 ? toRow46(row) : (function() { while (row.length < NUM_COLS) row.push(""); return row.slice(0, NUM_COLS).map(celdaAString); })();
      var key = buildKey(fila);
      if (existingKeys[key]) return;
      existingKeys[key] = true;
      filasHoja2.push(rowHoja2(fila, row.length >= 52 ? row : null));
      if (!esCero(fila[14]) && !esCero(fila[16]) && !esCero(fila[17])) nuevasFilas.push(fila);
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
      console.log("[doPost] Insertadas " + numRows + " filas desde fila " + startRow + " (Hoja 1)");
    }
    if (filasHoja2.length > 0) {
      var sheet2 = SpreadsheetApp.getActiveSpreadsheet().getSheets()[1];
      if (sheet2) {
        if (sheet2.getLastRow() === 0) {
          sheet2.appendRow(["FECHA", "ENSAYO_NUMERO", "N_JARRA", "INICIO_C", "TERMINO_C", "MIN_C", "INICIO_T", "TERMINO_T", "MIN_T"]);
        }
        var startRow2 = sheet2.getLastRow() + 1;
        sheet2.getRange(startRow2, 1, filasHoja2.length, 9).setValues(filasHoja2);
        console.log("[doPost] Insertadas " + filasHoja2.length + " filas en Hoja 2 (réplica FECHA,ENSAYO_NUMERO,N_JARRA; incl. N_CLAMSHELL=0)");
      }
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

function safeJson(val) {
  try {
    if (val == null) return '';
    if (typeof val === 'string') return val;
    return JSON.stringify(val);
  } catch (_) {
    return '';
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
 * Orden oficial de columnas packing (40 columnas por fila):
 * 1-4:   FECHA_INSPECCION, RESPONSABLE, HORA_RECEPCION, N_VIAJE
 * 5-9:   RECEPCION, INGRESO_GASIFICADO, SALIDA_GASIFICADO, INGRESO_PREFRIO, SALIDA_PREFRIO
 * 10-14: PESO_RECEPCION, PESO_INGRESO_GASIFICADO, PESO_SALIDA_GASIFICADO, PESO_INGRESO_PREFRIO, PESO_SALIDA_PREFRIO
 * 15-24: T_AMB_RECEP, T_PULP_RECEP, T_AMB_ING, T_PULP_ING, T_AMB_SAL, T_PULP_SAL, T_AMB_PRE_IN, T_PULP_PRE_IN, T_AMB_PRE_OUT, T_PULP_PRE_OUT
 * 25-29: HUMEDAD_RECEPCION, HUMEDAD_INGRESO_GASIFICADO, HUMEDAD_SALIDA_GASIFICADO, HUMEDAD_INGRESO_PREFRIO, HUMEDAD_SALIDA_PREFRIO
 * 30-34: PRESION_AMB_RECEPCION, PRESION_AMB_INGRESO_GASIFICADO, PRESION_AMB_SALIDA_GASIFICADO, PRESION_AMB_INGRESO_PREFRIO, PRESION_AMB_SALIDA_PREFRIO
 * 35-39: PRESION_FRUTA_RECEPCION, PRESION_FRUTA_INGRESO_GASIFICADO, PRESION_FRUTA_SALIDA_GASIFICADO, PRESION_FRUTA_INGRESO_PREFRIO, PRESION_FRUTA_SALIDA_PREFRIO
 * 40:    OBSERVACION
 *
 * getPackingHeaderNamesPerRow devuelve las columnas 5-40 (36 nombres); las 4 primeras se agregan en doPostPacking.
 */
function getPackingHeaderNamesPerRow() {
  return [
    'RECEPCION', 'INGRESO_GASIFICADO', 'SALIDA_GASIFICADO', 'INGRESO_PREFRIO', 'SALIDA_PREFRIO',
    'PESO_RECEPCION', 'PESO_INGRESO_GASIFICADO', 'PESO_SALIDA_GASIFICADO', 'PESO_INGRESO_PREFRIO', 'PESO_SALIDA_PREFRIO',
    'T_AMB_RECEP', 'T_PULP_RECEP', 'T_AMB_ING', 'T_PULP_ING', 'T_AMB_SAL', 'T_PULP_SAL', 'T_AMB_PRE_IN', 'T_PULP_PRE_IN', 'T_AMB_PRE_OUT', 'T_PULP_PRE_OUT',
    'HUMEDAD_RECEPCION', 'HUMEDAD_INGRESO_GASIFICADO', 'HUMEDAD_SALIDA_GASIFICADO', 'HUMEDAD_INGRESO_PREFRIO', 'HUMEDAD_SALIDA_PREFRIO',
    'PRESION_AMB_RECEPCION', 'PRESION_AMB_INGRESO_GASIFICADO', 'PRESION_AMB_SALIDA_GASIFICADO', 'PRESION_AMB_INGRESO_PREFRIO', 'PRESION_AMB_SALIDA_PREFRIO',
    'PRESION_FRUTA_RECEPCION', 'PRESION_FRUTA_INGRESO_GASIFICADO', 'PRESION_FRUTA_SALIDA_GASIFICADO', 'PRESION_FRUTA_INGRESO_PREFRIO', 'PRESION_FRUTA_SALIDA_PREFRIO',
    'OBSERVACION'
  ];
}

/** Encabezados para packing: desde col 47 en Hoja 1. HORA_RECEPCION, N_VIAJE + 36 nombres por fila. */
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
 * POST Packing: fecha, ensayo, packingRows, thermoking… Opcional: guardar_packing, guardar_thermoking (default true), actualizar_c5 (default true si no viene).
 * Si packing ya está en hoja: merge — puede escribir Thermo King y/o C5 sin pisar cols 47–86.
 */
function doPostPacking(sheet, data) {
  try {
    var guardarPacking = (data.guardar_packing === false || data.guardar_packing === 'false') ? false : true;
    var actualizarC5 = (data.actualizar_c5 === false || data.actualizar_c5 === 'false') ? false : true;

    var fecha = (data.fecha != null && data.fecha !== '') ? String(data.fecha).trim() : '';
    var ensayoNumero = (data.ensayo_numero != null && data.ensayo_numero !== '') ? String(data.ensayo_numero).trim() : '';
    var fechaInspeccion = (data.fecha_inspeccion != null && data.fecha_inspeccion !== '') ? String(data.fecha_inspeccion).trim() : '';
    var responsable = (data.responsable != null && data.responsable !== '') ? String(data.responsable).trim() : '';
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

    var primeraFila = rowIndices[0];
    var packingYaExiste = rangeRowHasAnyValue_(sheet, primeraFila, PACKING_START_COL, PACKING_COLS);
    var guardarThermoking;
    if (data.guardar_thermoking === false || data.guardar_thermoking === 'false') guardarThermoking = false;
    else if (data.guardar_thermoking === true || data.guardar_thermoking === 'true') guardarThermoking = true;
    else guardarThermoking = packingYaExiste ? false : true;

    if (packingYaExiste) {
      if (actualizarC5) {
        var c5HeadersMerge = getC5FlatHeaders();
        setSheetRowValues_(sheet, 1, C5_START_COL, c5HeadersMerge);
        for (var cm = 0; cm < rowIndices.length; cm++) {
          var c5Merge = buildC5FlatRow(data, cm);
          setSheetRowValues_(sheet, rowIndices[cm], C5_START_COL, c5Merge);
        }
      }
      if (guardarThermoking) {
        var tkHeadersMerge = getThermokingFlatHeaders();
        setSheetRowValues_(sheet, 1, THERMOKING_START_COL, tkHeadersMerge);
        for (var tix = 0; tix < rowIndices.length; tix++) {
          var termoMerge = buildThermokingFlatRow(data, tix);
          setSheetRowValues_(sheet, rowIndices[tix], THERMOKING_START_COL, termoMerge);
        }
      }
      if (!actualizarC5 && !guardarThermoking) {
        return { ok: false, error: 'Nada que actualizar (packing ya en hoja; sin C5 ni Thermo King)' };
      }
      return {
        ok: true,
        message: 'Actualización en ' + rowIndices.length + ' fila(s) (packing existente; C5/Thermo según flags)',
        filasEscritas: rowIndices.length,
        mergeSoloC5: actualizarC5
      };
    }

    var startCol = PACKING_START_COL;
    var COLS_POR_FILA = 4 + 36;
    var baseHeaders = ['FECHA_INSPECCION', 'RESPONSABLE', 'HORA_RECEPCION', 'N_VIAJE'].concat(getPackingHeaderNamesPerRow());

    if (guardarPacking) {
      for (var i = 0; i < packingRows.length && i < rowIndices.length; i++) {
        var row = packingRows[i];
        var filaHoja = rowIndices[i];
        var valores = [fechaInspeccion, responsable, horaRecepcion, nViaje];
        if (Array.isArray(row)) {
          for (var j = 0; j < 36; j++) {
            valores.push((j < row.length && row[j] != null && row[j] !== '') ? row[j] : '');
          }
        } else {
          for (var j = 0; j < 36; j++) valores.push('');
        }
        setSheetRowValues_(sheet, filaHoja, startCol, valores);
      }
      setSheetRowValues_(sheet, 1, startCol, baseHeaders);
    }

    if (guardarThermoking) {
      var tkHeaders = getThermokingFlatHeaders();
      setSheetRowValues_(sheet, 1, THERMOKING_START_COL, tkHeaders);
      for (var ti = 0; ti < rowIndices.length; ti++) {
        var termoVals = buildThermokingFlatRow(data, ti);
        setSheetRowValues_(sheet, rowIndices[ti], THERMOKING_START_COL, termoVals);
      }
    }

    if (actualizarC5) {
      var c5Headers = getC5FlatHeaders();
      setSheetRowValues_(sheet, 1, C5_START_COL, c5Headers);
      for (var ci = 0; ci < rowIndices.length; ci++) {
        var c5ValsPacking = buildC5FlatRow(data, ci);
        setSheetRowValues_(sheet, rowIndices[ci], C5_START_COL, c5ValsPacking);
      }
    }

    if (!guardarPacking && !guardarThermoking && !actualizarC5) {
      return { ok: false, error: 'Nada que escribir (guardar_packing, guardar_thermoking y actualizar_c5 en false)' };
    }

    return {
      ok: true,
      message: 'Guardado en ' + rowIndices.length + ' fila(s) (Packing/Thermo/C5 según flags)',
      filasEscritas: rowIndices.length,
      packingMuestras: packingRows.length
    };
  } catch (err) {
    return { ok: false, error: err.toString() };
  }
}

/**
 * POST Recepción C5: marca/guarda C5 por fecha+ensayo (misma fila lógica).
 * Bloque C5: columnas planas desde C5_START_COL (después de Thermo King).
 */
function doPostRecepcionC5(sheet, data) {
  try {
    var fecha = (data.fecha != null && data.fecha !== '') ? String(data.fecha).trim() : '';
    var ensayoNumero = (data.ensayo_numero != null && data.ensayo_numero !== '') ? String(data.ensayo_numero).trim() : '';
    if (!fecha || !ensayoNumero) return { ok: false, error: 'Faltan fecha o ensayo_numero' };

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, error: 'No hay datos en la hoja' };

    var dataRows = sheet.getRange(2, 1, lastRow - 1, 13).getValues();
    var rowIndices = [];
    for (var k = 0; k < dataRows.length; k++) {
      var r = dataRows[k];
      var rowFechaStr = formatFechaPacking(r[0]);
      var rowEn = (r[12] != null && r[12] !== '') ? String(r[12]).trim() : '';
      if (rowFechaStr === fecha && rowEn === ensayoNumero) rowIndices.push(2 + k);
    }
    if (rowIndices.length === 0) return { ok: false, error: 'No se encontró ninguna fila para esa fecha y ensayo' };

    var c5Headers = getC5FlatHeaders();
    setSheetRowValues_(sheet, 1, C5_START_COL, c5Headers);

    for (var ci = 0; ci < rowIndices.length; ci++) {
      var c5Vals = buildC5FlatRow(data, ci);
      setSheetRowValues_(sheet, rowIndices[ci], C5_START_COL, c5Vals);
    }
    return { ok: true, message: 'Recepción C5 guardada', fila: rowIndices[0], filasEscritas: rowIndices.length };
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
    var fechaParam = (params.fecha || '').toString().trim();
    var ensayoNumero = (params.ensayo_numero || '').toString().trim();
    var callback = (params.callback || '').toString().trim();
    if (!/^[a-zA-Z0-9_]+$/.test(callback)) callback = '';

    function returnOutput(obj) {
      if (callback) return outputJsonp(obj, callback);
      return outputJson(obj);
    }

    // Misma hoja que doPost (primera hoja) para que el conteo de filas coincida con la hoja donde se escriben los datos
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      result.error = 'No hay datos en la hoja';
      return returnOutput(result);
    }

    // Incluir col 20 (DESPACHO_ACOPIO, índice 19) para devolver despachoPorFila al cargar packing por GET
    var data = sheet.getRange(2, 1, lastRow, 20).getValues();

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
    // Normalizar fecha del request a yyyy-MM-dd para comparar con la hoja
    var fecha = (fechaParam && formatFecha(fechaParam)) ? formatFecha(fechaParam) : fechaParam;

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

    // 2) Listar ensayos para una fecha — devuelve números y estado packing/C5.
    if (fecha && !ensayoNumero) {
      var c5NumColsLista = getC5FlatHeaders().length;
      var packingBlock = (lastRow >= 2) ? sheet.getRange(2, PACKING_START_COL, lastRow, PACKING_COLS).getValues() : [];
      var tkColsLista = getThermokingSheetColumnCount_();
      var c5Block = (lastRow >= 2) ? sheet.getRange(2, C5_START_COL, lastRow, c5NumColsLista).getValues() : [];
      var ensayosInfo = {};
      for (var j = 0; j < data.length; j++) {
        var rowFechaStr = formatFecha(data[j][0]);
        if (rowFechaStr === fecha) {
          var en = String(data[j][12] || '').trim();
          if (en) {
            if (!ensayosInfo[en]) ensayosInfo[en] = { tieneVisual: false, tienePacking: false, tieneRecepcionC5: false, tieneThermoKing: false, fundo: '' };
            /* Fila principal en hoja para esa fecha+ensayo = registro calibrado (Visual); no depender de subrango de columnas. */
            ensayosInfo[en].tieneVisual = true;
            var fundoNorm = String(data[j][10] || '').trim().toUpperCase();
            if (fundoNorm) ensayosInfo[en].fundo = fundoNorm;
            if (packingBlock[j] && rowHasAnyNonEmpty_(packingBlock[j])) ensayosInfo[en].tienePacking = true;
            if (c5Block[j] && rowHasAnyNonEmpty_(c5Block[j])) ensayosInfo[en].tieneRecepcionC5 = true;
            /* Misma fila física que data[j]: leer TK con ancho exacto del bloque (evita columnas fantasmas por desfase 37/39). */
            var filaSheetLista = j + 2;
            if (rangeRowHasAnyValue_(sheet, filaSheetLista, THERMOKING_START_COL, tkColsLista)) ensayosInfo[en].tieneThermoKing = true;
          }
        }
      }
      var ensayosList = Object.keys(ensayosInfo).sort();
      result.ok = true;
      result.ensayos = ensayosList;
      result.ensayosConVisual = {};
      result.ensayosConPacking = {};
      result.ensayosConC5 = {};
      result.ensayosConThermoKing = {};
      result.fundoPorEnsayo = {};
      ensayosList.forEach(function (e) { result.ensayosConVisual[e] = ensayosInfo[e].tieneVisual; });
      ensayosList.forEach(function (e) { result.ensayosConPacking[e] = ensayosInfo[e].tienePacking; });
      ensayosList.forEach(function (e) { result.ensayosConC5[e] = ensayosInfo[e].tieneRecepcionC5; });
      ensayosList.forEach(function (e) { result.ensayosConThermoKing[e] = ensayosInfo[e].tieneThermoKing; });
      ensayosList.forEach(function (e) { result.fundoPorEnsayo[e] = ensayosInfo[e].fundo || ''; });
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

    // Normalizar ensayo_numero para comparar igual que en existe_registro (evitar contar de más por "1" vs 1)
    var enNorm = (ensayoNumero !== null && ensayoNumero !== undefined && String(ensayoNumero).trim() !== '') ? (function () {
      var n = Number(ensayoNumero);
      return (!isNaN(n) && n === Math.floor(n)) ? String(n) : String(ensayoNumero).trim();
    })() : '';

    var row = null;
    var filaEnSheet = null;
    var numFilas = 0;
    var despachoPorFila = [];
    var tienePacking = false;
    var tieneRecepcionC5 = false;
    var tieneThermoKing = false;
    var c5NumColsDetalle = getC5FlatHeaders().length;
    for (var k = 0; k < data.length; k++) {
      var r = data[k];
      var rowFechaStr = formatFecha(r[0]);
      var rowEn = r[12];
      var rowEnStr = (rowEn !== null && rowEn !== undefined && rowEn !== '') ? (function () {
        var n = Number(rowEn);
        return (!isNaN(n) && n === Math.floor(n)) ? String(n) : String(rowEn).trim();
      })() : '';
      if (rowFechaStr === fecha && rowEnStr === enNorm) {
        if (row == null) {
          row = r;
          filaEnSheet = 2 + k;
        }
        numFilas++;
        var desp = r[19];
        var numDesp = (desp !== null && desp !== undefined && String(desp).trim() !== '') ? parseFloat(String(desp).replace(',', '.')) : NaN;
        despachoPorFila.push(!isNaN(numDesp) ? numDesp : null);
        var filaSheetK = 2 + k;
        if (rangeRowHasAnyValue_(sheet, filaSheetK, PACKING_START_COL, PACKING_COLS)) tienePacking = true;
        if (rangeRowHasAnyValue_(sheet, filaSheetK, C5_START_COL, c5NumColsDetalle)) tieneRecepcionC5 = true;
        if (rangeRowHasAnyValue_(sheet, filaSheetK, THERMOKING_START_COL, getThermokingSheetColumnCount_())) tieneThermoKing = true;
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
      tienePacking: tienePacking,
      tieneRecepcionC5: tieneRecepcionC5,
      tieneThermoKing: tieneThermoKing,
      despachoPorFila: despachoPorFila,
      ENSAYO_NUMERO: row[12],
      TRAZ_ETAPA: row[7],
      TRAZ_CAMPO: row[8],
      TRAZ_LIBRE: row[9],
      VARIEDAD: row[3],
      PLACA_VEHICULO: row[4],
      FUNDO: row[10],
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