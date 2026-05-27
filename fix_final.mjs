import fs from 'fs';

function fixFile(file) {
  let content = fs.readFileSync(file, 'utf8');

  // Fix SI accents and encoding issues globally
  content = content.replace(/SÃ\s/g, 'SI ');
  content = content.replace(/SÃ /g, 'SI ');
  content = content.replace(/SÃ/g, 'SI');
  content = content.replace(/SÍ/g, 'SI');
  content = content.replace(/Sí/g, 'SI');
  content = content.replace(/sí/g, 'SI');
  content = content.replace(/Válido a nivel SAT/g, 'Valido a nivel SAT');
  
  // SAT logic
  if (file.includes('cfdiEngine')) {
     content = content.replace(
       /if \(\/NO CONFIRMADO\|FALLA\|ERROR\|TIMEOUT\|CORS\|CONEX\/i\.test\(String\(r\.estatusSAT \|\| ""\)\)\) \{\n\s*estatusDocumental = "SAT no confirmado";\n\s*\}/g,
       `if (/NO CONFIRMADO|FALLA|ERROR|TIMEOUT|CORS|CONEX|Error Conexi/i.test(String(r.estatusSAT || ""))) {
        estatusDocumental = "ESTATUS SAT NO CONFIRMADO";
    }`
     );
     // Force estatusDocumental update
     content = content.replace(/let estatusDocumental = "Valido a nivel SAT";/g, 'let estatusDocumental = "Valido a nivel SAT";');
  }

  // excelExporter specific fixes
  if (file.includes('excelExporter')) {
     content = content.replace(/Falta identificaci(?:Ã³|ó)n/gi, 'Falta identificacion');
     content = content.replace(/Falta pedimento\./g, 'Falta pedimento');
     content = content.replace(/Falta identificacion bancaria\./g, 'Falta identificacion bancaria');
     content = content.replace(/Falta DODA\./g, 'Falta DODA');
     content = content.replace(/Entry\./g, 'Falta Entry');
     
     // Duplicates in Datos_Faltantes and no 'Fuente externa requerida'
     const faltantesOld = `const getDatosFaltantes = (r: ValidationResult) => {`;
     const faltantesNew = `const getDatosFaltantes = (r: ValidationResult) => {
  const faltantesOriginales = [];
  if (r.trazabilidadInfo?.datosFaltantes && r.trazabilidadInfo.datosFaltantes !== 'Ninguno' && r.trazabilidadInfo.datosFaltantes !== 'NO APLICA') {
    faltantesOriginales.push(...String(r.trazabilidadInfo.datosFaltantes).split('|').map(v => v.trim()).filter(Boolean));
  }
  if (getCartaPortePresente(r) === 'NO') faltantesOriginales.push('Carta Porte');
  if (r.trazabilidadInfo?.tienePedimento?.toUpperCase() === 'NO') faltantesOriginales.push('Falta pedimento');
  if (r.trazabilidadInfo?.tieneDoda?.toUpperCase() === 'NO') faltantesOriginales.push('Falta DODA');
  if (r.trazabilidadInfo?.tieneEntryNumber?.toUpperCase() === 'NO') faltantesOriginales.push('Falta Entry');
  if (!String(r.trazabilidadInfo?.identificadorBancario || '').toUpperCase().includes('SI')) faltantesOriginales.push('Falta identificacion bancaria');

  const set = new Set(faltantesOriginales.map(f => {
     let c = f.replace(/\\./g, '').replace(/identificaci(?:Ã³|ó)n/gi, 'identificacion');
     if (c === 'Entry') return 'Falta Entry';
     if (c === 'Pedimento') return 'Falta pedimento';
     if (c === 'DODA') return 'Falta DODA';
     return c;
  }));
  set.delete('Fuente externa requerida');
  
  const arr = Array.from(set);
  return arr.length ? arr.join(' | ') : 'Sin faltantes criticos';
};

const _ignored_getDatosFaltantes = (r: ValidationResult) => {`;
     if (!content.includes('_ignored_getDatosFaltantes')) {
         content = content.replace(faltantesOld, faltantesNew);
     }

     // Duplicate Alerts + MAT rules
     content = content.replace(/addAlert\(alerts, r, 'MATERIALIDAD', 'MAT-01', 'ROJO', 'ALERTA ROJA: CFDI cancelado.', r\.estatusSAT, 'No usar sin revision manual\.'\);/g, 
        `addAlert(alerts, r, 'MATERIALIDAD', 'MAT-01', 'ROJO', 'ALERTA ROJA: CFDI cancelado.', r.estatusSAT, 'No usar sin revision manual.');`);
     content = content.replace(/addAlert\(alerts, r, 'MATERIALIDAD', 'MAT-02', 'NARANJA', 'ALERTA NARANJA: Estatus SAT no confirmado\. Validar manualmente\.', getSatExportFields\(r\)\.Estatus_SAT, 'Reintentar validacion SAT o validar manualmente\.'\);/g,
        `addAlert(alerts, r, 'MATERIALIDAD', 'MAT-02', 'NARANJA', 'ALERTA NARANJA: Estatus SAT no confirmado. Validar manualmente.', getSatExportFields(r).Estatus_SAT, 'Reintentar validacion SAT o validar manualmente.');`);
     
     content = content.replace(/addAlert\(alerts, r, 'MATERIALIDAD', 'MAT-01', 'NARANJA', 'Estatus SAT no confirmado\.', r\.estatusSAT, 'Validar manualmente antes de usar en devoluci(?:Ã³|ó)n\/acreditamiento\.'\);/g, '');
     content = content.replace(/addAlert\(alerts, r, 'MATERIALIDAD', 'MAT-02', 'ROJO', 'CFDI cancelado\.', r\.estatusSAT, 'No usar para acreditamiento\/deducci(?:Ã³|ó)n sin revisi(?:Ã³|ó)n\.'\);/g, '');

     content = content.replace(/return alerts;/g, `
  const uniqueAlerts = [];
  const seen = new Set();
  alerts.forEach(a => {
    const key = \`\${a.UUID}-\${a.Regla}-\${a.Tipo_Alerta}\`;
    if (!seen.has(key)) { seen.add(key); uniqueAlerts.push(a); }
  });
  return uniqueAlerts;`);

     // Tipo_Registro in AUDITORIA IVA TASA 0%
     content = content.replace(/Archivo_XML: r\.fileName,\s*UUID: r\.uuid,\s*Serie: r\.serie,/g, "Archivo_XML: r.fileName,\n        UUID: r.uuid,\n        Tipo_Registro: 'CONCEPTO',\n        Serie: r.serie,");
     
     // c.concepto -> c.descripcion for TS errors
     content = content.replace(/c => c\.concepto/g, '(c: any) => c.descripcion');
     
     // "Version_Carta_Porte = 4.0: 0"
     content = content.replace(/const getCartaPorteVersion = \(r: ValidationResult\) => \{[\s\S]*?return version || 'NO APLICA';\n\};/g, `const getCartaPorteVersion = (r: ValidationResult) => {
  const version = r.versionCartaPorte;
  if (!version || version === '4.0' || version === 'NO APLICA') {
    if (getCartaPortePresente(r) === 'SI') return '3.1';
    return 'NO APLICA';
  }
  return version;
};`);

     // REQUIERE CAPTURA -> REQUIERE IMPORTACION
     content = content.replace(/REQUIERE CAPTURA/g, 'REQUIERE IMPORTACION');
  }

  fs.writeFileSync(file, content);
}

fixFile('client/src/lib/cfdiEngine.ts');
fixFile('client/src/lib/excelExporter.ts');
console.log("Done fixing.");
