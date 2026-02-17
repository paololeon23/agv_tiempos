/**
 * Google Apps Script - MTTP Arándano
 * Recibe datos del formulario y los escribe en la hoja activa.
 * 50 columnas (sin TEMP_AMB_*; se eliminó wrapper_tempambiente).
 *
 * ANTI-DUPLICADOS (evita réplicas por fallas de internet o reintentos):
 * 1) Idempotencia por UID: si el mismo envío (uid) ya se procesó, no se inserta de nuevo.
 * 2) Clave de fila: cada fila existente tiene una clave normalizada; si la fila ya está, no se inserta.
 * Así, aunque el mismo registro se envíe varias veces, solo se guarda una vez.
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
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const data = JSON.parse(e.postData.contents);

    const rows = data.rows || [];
    const uid = data.uid || null;

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
        "TRAZ_ETAPA", "TRAZ_CAMPO", "TRAZ_LIBRE", "ENSAYO_NUMERO", "ENSAYO_NOMBRE", "N_CLAMSHELL", "N_JARRA",
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

    const NUM_COLS = 50;

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

    var lastRow = sheet.getLastRow();
    var existingKeys = {};
    if (lastRow >= 2) {
      var numDataRows = lastRow - 1;
      var existingValues = sheet.getRange(2, 1, numDataRows, NUM_COLS).getValues();
      existingValues.forEach(function(r) {
        var key = buildKey(r);
        if (key) existingKeys[key] = true;
      });
    }

    var nuevasFilas = [];
    rows.forEach(function(row) {
      while (row.length < NUM_COLS) row.push("");
      var fila = row.slice(0, NUM_COLS);
      var key = buildKey(fila);
      if (!existingKeys[key]) {
        nuevasFilas.push(fila);
        existingKeys[key] = true;
      }
    });

    // Re-leer la hoja justo antes de escribir (por si otro request escribió mientras esperaba el lock)
    lastRow = sheet.getLastRow();
    existingKeys = {};
    if (lastRow >= 2) {
      var numDataRows2 = lastRow - 1;
      existingValues = sheet.getRange(2, 1, numDataRows2, NUM_COLS).getValues();
      existingValues.forEach(function(r) {
        var key = buildKey(r);
        if (key) existingKeys[key] = true;
      });
      var filtradas = [];
      nuevasFilas.forEach(function(fila) {
        if (!existingKeys[buildKey(fila)]) {
          filtradas.push(fila);
          existingKeys[buildKey(fila)] = true;
        }
      });
      nuevasFilas = filtradas;
    }

    if (nuevasFilas.length > 0) {
      var startRow = sheet.getLastRow() + 1;
      var numRows = nuevasFilas.length;
      sheet.getRange(startRow, 1, numRows, NUM_COLS).setValues(nuevasFilas);
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

/**
 * GET: dos parámetros (fecha + ensayo_numero) para sacar la info y llenar el front.
 * - fecha: yyyy-mm-dd (ej. 2026-02-17)
 * - ensayo_numero: "1", "2", "3" o "4" (columna K de la hoja)
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

    var data = sheet.getRange(2, 1, lastRow, 12).getValues();

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

    // 2) Listar ensayos para una fecha (solo fecha) — devuelve números de ensayo (col K)
    if (fecha && !ensayoNumero) {
      var ensayosSet = {};
      for (var j = 0; j < data.length; j++) {
        var rowFechaStr = formatFecha(data[j][0]);
        if (rowFechaStr === fecha) {
          var en = String(data[j][10] || '').trim();
          if (en) ensayosSet[en] = true;
        }
      }
      var ensayosList = Object.keys(ensayosSet).sort();
      result.ok = true;
      result.ensayos = ensayosList;
      return returnOutput(result);
    }

    // 3) Obtener fila por fecha + ensayo_numero (columna K = número 1, 2, 3, 4)
    if (!fecha || !ensayoNumero) {
      result.error = 'Faltan parámetros: fecha y ensayo_numero';
      return returnOutput(result);
    }

    var row = null;
    for (var k = 0; k < data.length; k++) {
      var r = data[k];
      var rowFechaStr = formatFecha(r[0]);
      var rowNum = String(r[10] != null ? r[10] : '').trim();
      if (rowFechaStr === fecha && rowNum === ensayoNumero) {
        row = r;
        break;
      }
    }

    if (!row) {
      result.error = 'No hay registro para esa fecha y ensayo';
      return returnOutput(result);
    }

    result.ok = true;
    result.data = {
      ENSAYO_NUMERO: row[10],
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
