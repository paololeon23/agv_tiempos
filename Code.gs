/**
 * Google Apps Script - MTTP Arándano
 * Recibe datos del formulario y los escribe en la hoja activa.
 * Orden de columnas (54): FECHA, RESPONSABLE, GUIA_REMISION, VARIEDAD, PLACA_VEHICULO,
 * HORA_INICIO_GENERAL, DIAS_PRECOSECHA, TRAZ_ETAPA, TRAZ_CAMPO, TRAZ_LIBRE, ENSAYO_NUMERO,
 * ENSAYO_NOMBRE, N_CLAMSHELL, N_JARRA, PESO_1, PESO_2, LLEGADA_ACOPIO, DESPACHO_ACOPIO,
 * INICIO_C, TERMINO_C, MIN_C, INICIO_T, TERMINO_T, MIN_T, TEMP_MUE_INICIO_AMB, TEMP_MUE_INICIO_PUL,
 * TEMP_MUE_TERMINO_AMB, TEMP_MUE_TERMINO_PUL, TEMP_MUE_LLEGADA_AMB, TEMP_MUE_LLEGADA_PUL,
 * TEMP_MUE_DESPACHO_AMB, TEMP_MUE_DESPACHO_PUL, TIEMPO_INICIO_COSECHA, TIEMPO_PERDIDA_PESO,
 * TIEMPO_TERMINO_COSECHA, TIEMPO_LLEGADA_ACOPIO, TIEMPO_DESPACHO_ACOPIO, HUMEDAD_INICIO,
 * HUMEDAD_TERMINO, HUMEDAD_LLEGADA, HUMEDAD_DESPACHO, TEMP_AMB_INICIO, TEMP_AMB_TERMINO,
 * TEMP_AMB_LLEGADA, TEMP_AMB_DESPACHO, PRESION_AMB_INICIO, PRESION_AMB_TERMINO,
 * PRESION_AMB_LLEGADA, PRESION_AMB_DESPACHO, PRESION_FRUTA_INICIO, PRESION_FRUTA_TERMINO,
 * PRESION_FRUTA_LLEGADA, PRESION_FRUTA_DESPACHO, OBSERVACION
 */
function doPost(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "Sin datos POST" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const data = JSON.parse(e.postData.contents);

    // data.rows = array de filas, cada fila = array de 54 valores
    const rows = data.rows || [];

    if (rows.length === 0) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "Sin filas" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Crear encabezados si la hoja está vacía
    if (sheet.getLastRow() === 0) {
      const headers = [
        "FECHA", "RESPONSABLE", "GUIA_REMISION", "VARIEDAD", "PLACA_VEHICULO", "HORA_INICIO_GENERAL", "DIAS_PRECOSECHA",
        "TRAZ_ETAPA", "TRAZ_CAMPO", "TRAZ_LIBRE", "ENSAYO_NUMERO", "ENSAYO_NOMBRE", "N_CLAMSHELL", "N_JARRA",
        "PESO_1", "PESO_2", "LLEGADA_ACOPIO", "DESPACHO_ACOPIO", "INICIO_C", "TERMINO_C", "MIN_C", "INICIO_T", "TERMINO_T", "MIN_T",
        "TEMP_MUE_INICIO_AMB", "TEMP_MUE_INICIO_PUL", "TEMP_MUE_TERMINO_AMB", "TEMP_MUE_TERMINO_PUL",
        "TEMP_MUE_LLEGADA_AMB", "TEMP_MUE_LLEGADA_PUL", "TEMP_MUE_DESPACHO_AMB", "TEMP_MUE_DESPACHO_PUL",
        "TIEMPO_INICIO_COSECHA", "TIEMPO_PERDIDA_PESO", "TIEMPO_TERMINO_COSECHA", "TIEMPO_LLEGADA_ACOPIO", "TIEMPO_DESPACHO_ACOPIO",
        "HUMEDAD_INICIO", "HUMEDAD_TERMINO", "HUMEDAD_LLEGADA", "HUMEDAD_DESPACHO",
        "TEMP_AMB_INICIO", "TEMP_AMB_TERMINO", "TEMP_AMB_LLEGADA", "TEMP_AMB_DESPACHO",
        "PRESION_AMB_INICIO", "PRESION_AMB_TERMINO", "PRESION_AMB_LLEGADA", "PRESION_AMB_DESPACHO",
        "PRESION_FRUTA_INICIO", "PRESION_FRUTA_TERMINO", "PRESION_FRUTA_LLEGADA", "PRESION_FRUTA_DESPACHO",
        "OBSERVACION"
      ];
      sheet.appendRow(headers);
    }

    // ==== ANTI-DUPLICADOS ====
    // Clave: toda la fila (54 columnas) convertida a string
    const buildKey = function(row) {
      return row.slice(0, 54).map(function(v) {
        return (v === null || v === undefined) ? "" : String(v);
      }).join("||");
    };

    // Leer filas existentes (sin encabezado) y construir set de claves
    const lastRow = sheet.getLastRow();
    var existingKeys = {};
    if (lastRow > 1) {
      const existingValues = sheet.getRange(2, 1, lastRow - 1, 54).getValues();
      existingValues.forEach(function(r) {
        var key = buildKey(r);
        if (key) existingKeys[key] = true;
      });
    }

    // Filtrar filas nuevas que no existan aún
    var nuevasFilas = [];
    rows.forEach(function(row) {
      // Asegurar que la fila tenga 54 columnas (rellenar con vacío si falta)
      while (row.length < 54) {
        row.push("");
      }
      var fila = row.slice(0, 54);
      var key = buildKey(fila);
      if (!existingKeys[key]) {
        nuevasFilas.push(fila);
        existingKeys[key] = true; // Evita duplicados dentro del mismo lote
      }
    });

    if (nuevasFilas.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, nuevasFilas.length, 54).setValues(nuevasFilas);
    }

    return ContentService.createTextOutput(JSON.stringify({ ok: true, received: rows.length, inserted: nuevasFilas.length }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
