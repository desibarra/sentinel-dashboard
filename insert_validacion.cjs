const fs = require('fs');
let c = fs.readFileSync('client/src/lib/excelExporter.ts', 'utf8');

// Insert at the end before returning or exporting
const insertionPoint = "  (XLSX as any).utils.book_append_sheet(wb, wsResumenHomologado, 'Resumen_Carta_Porte_Homologado');";
const idx = c.indexOf(insertionPoint);

if (idx !== -1) {
  const replacement = insertionPoint + 

  // --- NUEVA HOJA: VALIDACION_TECNICA_SENTINEL ---
  const dataValidacionTecnica: any[] = [];
  
  // Metricas base
  dataValidacionTecnica.push({ Parametro: 'Total XML procesados', Resultado: totalXML });
  dataValidacionTecnica.push({ Parametro: 'Total CFDI principales', Resultado: validResults.length });
  dataValidacionTecnica.push({ Parametro: 'Total UUID relacionados detectados', Resultado: uuidRelTotal });
  dataValidacionTecnica.push({ Parametro: 'Total CFDI con Complemento Carta Porte', Resultado: cpPresente });
  dataValidacionTecnica.push({ Parametro: 'Total CFDI sin Complemento Carta Porte', Resultado: cpSinCP });
  dataValidacionTecnica.push({ Parametro: 'Total CFDI tipo E/P clasificados como NO APLICA', Resultado: cfdiEP });
  dataValidacionTecnica.push({ Parametro: 'Total UUID relacionados dentro de CFDI con Complemento Carta Porte', Resultado: uuidRelApuntaCP });
  dataValidacionTecnica.push({ Parametro: 'Total registros con posible inconsistencia', Resultado: aRevisar });
  
  // Validacion de Estructura de Hojas
  const hojasGeneradas = wb.SheetNames;
  const hojasCriticas = ['Diagnostico_CFDI', 'Trazabilidad_UUID', 'Resumen_Carta_Porte_Homologado'];
  const hojasOk = hojasCriticas.every(h => hojasGeneradas.includes(h));
  dataValidacionTecnica.push({ Parametro: 'Estructura de Hojas OK', Resultado: hojasOk ? 'SI' : 'NO' });
  
  // Validacion de Columnas Criticas
  const columnasCriticas = [
    'UUID buscado', 'Aparece como', 'UUID principal donde aparece', 
    'Tipo CFDI principal', 'Tipo relacion', 'Tiene Complemento Carta Porte principal', 
    'Tiene Complemento Carta Porte relacionado', 'Version Carta Porte', 'Observacion tecnica'
  ];
  let columnasOk = true;
  if (dataTrazabilidadUUID.length > 0) {
    const keys = Object.keys(dataTrazabilidadUUID[0]);
    columnasOk = columnasCriticas.every(c => keys.includes(c));
  }
  dataValidacionTecnica.push({ Parametro: 'Columnas Trazabilidad OK', Resultado: columnasOk ? 'SI' : 'NO' });
  
  // Alertas
  dataValidacionTecnica.push({ Parametro: '--- ALERTAS ---', Resultado: '' });
  
  if (!hojasOk) {
    dataValidacionTecnica.push({ Parametro: 'Alerta Hojas', Resultado: 'ERROR_ESTRUCTURA_EXCEL' });
  }
  if (!columnasOk) {
    dataValidacionTecnica.push({ Parametro: 'Alerta Columnas', Resultado: 'ERROR_COLUMNAS_TRAZABILIDAD' });
  }
  
  let alertasUUIDRel = 0;
  let alertasTipoI = 0;
  let alertasTipoEP = 0;
  
  uuidMap.forEach(node => {
    if (node.isRelated && !node.isPrincipal) alertasUUIDRel++;
    if (node.isPrincipal && node.tipoCFDI === 'I' && node.estatusCP === 'CP_NO_DETECTADA_REVISAR') alertasTipoI++;
    if (node.isPrincipal && (node.tipoCFDI === 'E' || node.tipoCFDI === 'P') && node.estatusCP === 'CP_NO_APLICA_POR_TIPO_CFDI') alertasTipoEP++;
  });
  
  dataValidacionTecnica.push({ Parametro: 'Alerta UUID relacionado puro', Resultado: alertasUUIDRel > 0 ? \\ marcados como UUID_RELACIONADO\ : 'OK' });
  dataValidacionTecnica.push({ Parametro: 'Alerta CFDI I sin CP', Resultado: alertasTipoI > 0 ? \\ marcados como REVISAR\ : 'OK' });
  dataValidacionTecnica.push({ Parametro: 'Alerta CFDI E/P sin CP', Resultado: alertasTipoEP > 0 ? \\ marcados como NO APLICA\ : 'OK' });

  const wsValidacionTecnica = (XLSX as any).utils.json_to_sheet(dataValidacionTecnica);
  (XLSX as any).utils.book_append_sheet(wb, wsValidacionTecnica, 'VALIDACION_TECNICA_SENTINEL');
  ;
  c = c.substring(0, idx) + replacement + c.substring(idx + insertionPoint.length);
  fs.writeFileSync('client/src/lib/excelExporter.ts', c, 'utf8');
}
