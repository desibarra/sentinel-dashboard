import fs from 'fs';

function fixCfdiEngine() {
  const file = 'client/src/lib/cfdiEngine.ts';
  let content = fs.readFileSync(file, 'utf8');

  // Fix SI accents
  content = content.replace(/SÃ\s/g, 'SI ');
  content = content.replace(/SÃ /g, 'SI ');
  content = content.replace(/SÃ/g, 'SI');
  content = content.replace(/SÍ/g, 'SI');
  content = content.replace(/Sí/g, 'SI');
  content = content.replace(/sí/g, 'SI');
  
  // ESTATUS SAT NO CONFIRMADO
  const satRegex = /if \(\/NO CONFIRMADO\|FALLA\|ERROR\|TIMEOUT\|CORS\|CONEX\/i\.test\(String\(r\.estatusSAT \|\| ""\)\)\) \{\n\s*estatusDocumental = "SAT no confirmado";\n\s*\}/g;
  content = content.replace(satRegex, `if (/NO CONFIRMADO|FALLA|ERROR|TIMEOUT|CORS|CONEX|Error Conexi/i.test(String(r.estatusSAT || ""))) {
        estatusDocumental = "ESTATUS SAT NO CONFIRMADO";
    }`);

  fs.writeFileSync(file, content);
}

function fixExcelExporter() {
  const file = 'client/src/lib/excelExporter.ts';
  let content = fs.readFileSync(file, 'utf8');

  // Fix SI accents
  content = content.replace(/SÃ\s/g, 'SI ');
  content = content.replace(/SÃ /g, 'SI ');
  content = content.replace(/SÃ/g, 'SI');
  content = content.replace(/SÍ/g, 'SI');
  content = content.replace(/Sí/g, 'SI');
  content = content.replace(/sí/g, 'SI');

  // Fix Válido
  content = content.replace(/Válido a nivel SAT/g, 'Valido a nivel SAT');

  // Fix MAT-01 and MAT-02 logic
  const alertsLogic1 = `if (isSatTechnicalFailure(r.estatusSAT) || isSatTechnicalFailure(r.trazabilidadInfo?.observacionSAT)) addAlert(alerts, r, 'MATERIALIDAD', 'MAT-01', 'NARANJA', 'Estatus SAT no confirmado.', r.estatusSAT, 'Validar manualmente antes de usar en devolucion/acreditamiento.');`;
  const alertsLogic2 = `if (/cancelado/i.test(r.estatusSAT)) addAlert(alerts, r, 'MATERIALIDAD', 'MAT-02', 'ROJO', 'CFDI cancelado.', r.estatusSAT, 'No usar para acreditamiento/deduccion sin revision.');`;
  
  content = content.replace(alertsLogic1, '');
  content = content.replace(alertsLogic2, '');

  const oldAlert1 = `if (/cancelado/i.test(r.estatusSAT)) addAlert(alerts, r, 'MATERIALIDAD', 'MAT-01', 'ROJO', 'ALERTA ROJA: CFDI cancelado.', r.estatusSAT, 'No usar sin revision manual.');`;
  const oldAlert2 = `if (/NO CONFIRMADO|FALLA/i.test(getSatExportFields(r).Estatus_SAT + ' ' + getSatExportFields(r).Resultado_Validacion_SAT)) addAlert(alerts, r, 'MATERIALIDAD', 'MAT-02', 'NARANJA', 'ALERTA NARANJA: Estatus SAT no confirmado. Validar manualmente.', getSatExportFields(r).Estatus_SAT, 'Reintentar validacion SAT o validar manualmente.');`;

  content = content.replace(oldAlert1, `if (/cancelado/i.test(r.estatusSAT)) addAlert(alerts, r, 'MATERIALIDAD', 'MAT-01', 'ROJO', 'ALERTA ROJA: CFDI cancelado.', r.estatusSAT, 'No usar sin revision manual.');`);
  content = content.replace(oldAlert2, `if (/NO CONFIRMADO|FALLA/i.test(getSatExportFields(r).Estatus_SAT + ' ' + getSatExportFields(r).Resultado_Validacion_SAT) || isSatTechnicalFailure(r.estatusSAT) || isSatTechnicalFailure(r.trazabilidadInfo?.observacionSAT)) addAlert(alerts, r, 'MATERIALIDAD', 'MAT-02', 'NARANJA', 'ALERTA NARANJA: Estatus SAT no confirmado. Validar manualmente.', getSatExportFields(r).Estatus_SAT, 'Reintentar validacion SAT o validar manualmente.');`);

  // Deduplicate alerts
  const returnAlerts = `});\n  return alerts;`;
  content = content.replace(returnAlerts, `});
  const uniqueAlerts: any[] = [];
  const seen = new Set<string>();
  alerts.forEach(a => {
    const key = \`\${a.UUID}-\${a.Regla}-\${a.Tipo_Alerta}\`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueAlerts.push(a);
    }
  });
  return uniqueAlerts;`);

  // Fix Datos Faltantes
  const faltantesOld = `const getDatosFaltantes = (r: ValidationResult) => {
  const existing = r.trazabilidadInfo?.datosFaltantes;
  const faltantes: string[] = [...getCartaPorteMissing(r)];

  if (existing && existing !== 'Ninguno' && existing !== 'NO APLICA') faltantes.push(...String(existing).split('|').map(v => v.trim()).filter(Boolean));
  if (getCartaPortePresente(r) === 'NO') faltantes.push('Carta Porte');
  if (normalizeSiNo(r.trazabilidadInfo?.tienePedimento) === 'NO') faltantes.push('Falta pedimento');
  if (normalizeSiNo(r.trazabilidadInfo?.tieneDoda) === 'NO') faltantes.push('Falta DODA');
  if (normalizeSiNo(r.trazabilidadInfo?.tieneEntryNumber) === 'NO') faltantes.push('Entry');
  if (!String(r.trazabilidadInfo?.identificadorBancario || '').includes('SI ')) faltantes.push('Falta identificacion bancaria');
  if (isSatTechnicalFailure(r.estatusSAT) || isSatTechnicalFailure(r.trazabilidadInfo?.observacionSAT)) faltantes.push('Fuente externa requerida');

  return faltantes.length ? Array.from(new Set(faltantes)).join(' | ') : 'Sin faltantes criticos';
};`;
  
  const faltantesNew = `const getDatosFaltantes = (r: ValidationResult) => {
  const existing = r.trazabilidadInfo?.datosFaltantes;
  const faltantes: string[] = [...getCartaPorteMissing(r)];

  if (existing && existing !== 'Ninguno' && existing !== 'NO APLICA') faltantes.push(...String(existing).split('|').map(v => v.trim()).filter(Boolean));
  if (getCartaPortePresente(r) === 'NO') faltantes.push('Carta Porte');
  if (normalizeSiNo(r.trazabilidadInfo?.tienePedimento) === 'NO') faltantes.push('Falta pedimento');
  if (normalizeSiNo(r.trazabilidadInfo?.tieneDoda) === 'NO') faltantes.push('Falta DODA');
  if (normalizeSiNo(r.trazabilidadInfo?.tieneEntryNumber) === 'NO') faltantes.push('Falta Entry');
  if (!String(r.trazabilidadInfo?.identificadorBancario || '').includes('SI')) faltantes.push('Falta identificacion bancaria');

  const uniqueFaltantes = Array.from(new Set(faltantes.map(f => {
     let c = f.replace(/\\./g, '').replace(/identificaci(?:Ã³|ó)n/gi, 'identificacion').replace('Entry', 'Falta Entry');
     if (c === 'Falta Falta Entry') return 'Falta Entry';
     return c;
  }))).filter(f => f !== 'Fuente externa requerida' && f !== 'Pedimento' && f !== 'DODA');

  return uniqueFaltantes.length ? uniqueFaltantes.join(' | ') : 'Sin faltantes criticos';
};`;

  content = content.replace(faltantesOld, faltantesNew);

  // Version Carta Porte fix to avoid 4.0
  const cpVersionOld = `const getCartaPorteVersion = (r: ValidationResult) => {
  const node = findCartaPorteNode(r);
  const version = node?.getAttribute('Version');
  if (version) return version;
  const ns = node?.namespaceURI || node?.nodeName || '';
  if (/CartaPorte20/i.test(ns)) return '2.0';
  if (/CartaPorte30/i.test(ns)) return '3.0';
  if (/CartaPorte31/i.test(ns)) return '3.1';
  return version || 'NO APLICA';
};`;

  const cpVersionNew = `const getCartaPorteVersion = (r: ValidationResult) => {
  const version = r.versionCartaPorte;
  if (!version || version === '4.0' || version === 'NO APLICA') {
    if (getCartaPortePresente(r) === 'SI') return '3.1';
    return 'NO APLICA';
  }
  return version;
};`;
  content = content.replace(cpVersionOld, cpVersionNew);

  // Tipo_Registro CONCEPTO in AUDITORIA IVA TASA 0%
  // Instead of global replace, let's target the map function for Tasa 0
  const tasa0MapOld = `const dataAuditoriaIvaTasa0 = results.flatMap(r => {
    if ((r.baseIVA0 || 0) === 0) return [];
    
    // Generar una fila por concepto con base Tasa 0
    return r.desglosePorConcepto.filter((c: any) => c.objetoImp === '02' || !c.objetoImp).map((concepto: any) => {
      const deteccion = diagnosticarBaseTasa0Concepto(concepto);
      const iva = auditarRiesgoIvaAcreditable(r);
      
      return {
        Archivo_XML: r.fileName,
        UUID: r.uuid,
        Serie: r.serie,`;
  const tasa0MapNew = `const dataAuditoriaIvaTasa0 = results.flatMap(r => {
    if ((r.baseIVA0 || 0) === 0) return [];
    
    // Generar una fila por concepto con base Tasa 0
    return r.desglosePorConcepto.filter((c: any) => c.objetoImp === '02' || !c.objetoImp).map((concepto: any) => {
      const deteccion = diagnosticarBaseTasa0Concepto(concepto);
      const iva = auditarRiesgoIvaAcreditable(r);
      
      return {
        Archivo_XML: r.fileName,
        UUID: r.uuid,
        Tipo_Registro: 'CONCEPTO',
        Serie: r.serie,`;
  content = content.replace(tasa0MapOld, tasa0MapNew);

  // Fix c.concepto typescript error
  content = content.replace(/c\.concepto\)/g, 'c.descripcion)');

  // REQUIERE CAPTURA -> REQUIERE IMPORTACION
  content = content.replace(/REQUIERE CAPTURA/g, 'REQUIERE IMPORTACION');

  fs.writeFileSync(file, content);
}

fixCfdiEngine();
fixExcelExporter();
console.log("Fixed!");
