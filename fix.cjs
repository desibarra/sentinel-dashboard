const fs = require('fs');
let content = fs.readFileSync('client/src/lib/excelExporter.ts', 'utf8');

const sanitizeOld = `  const replacements: Array<[RegExp, string]> = [
    [/validaci(?:Ã³|ó)n/gi, 'validacion'],
    [/mercanc(?:Ã\u00AD|í)as/gi, 'mercancias'],
    [/revisi(?:Ã³|ó)n/gi, 'revision'],
    [/t(?:Ã©|é)cnico/gi, 'tecnico'],
    [/cr(?:Ã\u00AD|í)tico/gi, 'critico'],
    [/importaci(?:Ã³|ó)n/gi, 'importacion'],
    [/exportaci(?:Ã³|ó)n/gi, 'exportacion'],
    [/log(?:Ã\u00AD|í)stica/gi, 'logistica'],
    [/log(?:Ã\u00AD|í)stico/gi, 'logistico'],
    [/identificaci(?:Ã³|ó)n/gi, 'identificacion'],
    [/retenci(?:Ã³|ó)n/gi, 'retencion'],
    [/descripci(?:Ã³|ó)n/gi, 'descripcion'],
    [/at(?:Ã\u00AD|í)pica/gi, 'atipica'],
    [/deducci(?:Ã³|ó)n/gi, 'deduccion'],
    [/n(?:Ã³|ó)mina/gi, 'nomina'],
    [/cr(?:Ã©|é)dito/gi, 'credito'],
  ];`;
const sanitizeNew = `  const replacements: Array<[RegExp, string]> = [
    [/validaci(?:[AÃ]³|Ã³|ó)n/gi, 'validacion'],
    [/mercanc(?:[AÃ]\u00AD|Ã\u00AD|í)as/gi, 'mercancias'],
    [/revisi(?:[AÃ]³|Ã³|ó)n/gi, 'revision'],
    [/t(?:[AÃ]©|Ã©|é)cnico/gi, 'tecnico'],
    [/cr(?:[AÃ]\u00AD|Ã\u00AD|í)tico/gi, 'critico'],
    [/importaci(?:[AÃ]³|Ã³|ó)n/gi, 'importacion'],
    [/exportaci(?:[AÃ]³|Ã³|ó)n/gi, 'exportacion'],
    [/log(?:[AÃ]\u00AD|Ã\u00AD|í)stica/gi, 'logistica'],
    [/log(?:[AÃ]\u00AD|Ã\u00AD|í)stico/gi, 'logistico'],
    [/identificaci(?:[AÃ]³|Ã³|ó)n/gi, 'identificacion'],
    [/retenci(?:[AÃ]³|Ã³|ó)n/gi, 'retencion'],
    [/descripci(?:[AÃ]³|Ã³|ó)n/gi, 'descripcion'],
    [/at(?:[AÃ]\u00AD|Ã\u00AD|í)pica/gi, 'atipica'],
    [/deducci(?:[AÃ]³|Ã³|ó)n/gi, 'deduccion'],
    [/n(?:[AÃ]³|Ã³|ó)mina/gi, 'nomina'],
    [/cr(?:[AÃ]©|Ã©|é)dito/gi, 'credito'],
    [/documentaci(?:[AÃ]³|Ã³|ó)n/gi, 'documentacion'],
    [/devoluci(?:[AÃ]³|Ã³|ó)n/gi, 'devolucion'],
  ];`;
content = content.replace(sanitizeOld, sanitizeNew);

const faltantesOld = `const getDatosFaltantes = (r: ValidationResult) => {
  const existing = r.trazabilidadInfo?.datosFaltantes;
  const faltantes: string[] = [...getCartaPorteMissing(r)];

  if (existing && existing !== 'Ninguno' && existing !== 'NO APLICA') faltantes.push(...String(existing).split('|').map(v => v.trim()).filter(Boolean));
  if (getCartaPortePresente(r) === 'NO') faltantes.push('Carta Porte');
  if (normalizeSiNo(r.trazabilidadInfo?.tienePedimento) === 'NO') faltantes.push('Falta pedimento');
  if (normalizeSiNo(r.trazabilidadInfo?.tieneDoda) === 'NO') faltantes.push('Falta DODA');
  if (normalizeSiNo(r.trazabilidadInfo?.tieneEntryNumber) === 'NO') faltantes.push('Entry');
  if (!String(r.trazabilidadInfo?.identificadorBancario || '').includes('SÃ ')) faltantes.push('Falta identificaciÃ³n bancaria');
  if (isSatTechnicalFailure(r.estatusSAT) || isSatTechnicalFailure(r.trazabilidadInfo?.observacionSAT)) faltantes.push('Fuente externa requerida');

  return faltantes.length ? Array.from(new Set(faltantes)).join(' | ') : 'Sin faltantes crÃ\u00ADticos';
};`;
const faltantesNew = `const getDatosFaltantes = (r: ValidationResult) => {
  const existing = r.trazabilidadInfo?.datosFaltantes;
  const faltantes: string[] = [...getCartaPorteMissing(r)];

  if (existing && existing !== 'Ninguno' && existing !== 'NO APLICA') faltantes.push(...String(existing).split('|').map(v => v.trim()).filter(Boolean));
  if (getCartaPortePresente(r) === 'NO') faltantes.push('Carta Porte');
  if (normalizeSiNo(r.trazabilidadInfo?.tienePedimento) === 'NO') faltantes.push('Falta pedimento');
  if (normalizeSiNo(r.trazabilidadInfo?.tieneDoda) === 'NO') faltantes.push('Falta DODA');
  if (normalizeSiNo(r.trazabilidadInfo?.tieneEntryNumber) === 'NO') faltantes.push('Falta Entry');
  if (!String(r.trazabilidadInfo?.identificadorBancario || '').includes('SÃ ')) faltantes.push('Falta identificacion bancaria');

  let uniqueFaltantes = Array.from(new Set(faltantes)).filter(f => f !== 'Fuente externa requerida');
  if (uniqueFaltantes.includes('Falta pedimento') && uniqueFaltantes.includes('Pedimento')) uniqueFaltantes = uniqueFaltantes.filter(f => f !== 'Pedimento');
  if (uniqueFaltantes.includes('Falta DODA') && uniqueFaltantes.includes('DODA')) uniqueFaltantes = uniqueFaltantes.filter(f => f !== 'DODA');
  if (uniqueFaltantes.includes('Falta Entry') && uniqueFaltantes.includes('Entry')) uniqueFaltantes = uniqueFaltantes.filter(f => f !== 'Entry');

  return uniqueFaltantes.length ? uniqueFaltantes.join(' | ') : 'Sin faltantes crÃ\u00ADticos';
};`;
content = content.replace(faltantesOld, faltantesNew);

const alertsOld = `    if (/cancelado/i.test(r.estatusSAT)) addAlert(alerts, r, 'MATERIALIDAD', 'MAT-01', 'ROJO', 'ALERTA ROJA: CFDI cancelado.', r.estatusSAT, 'No usar sin revision manual.');\n    if (/NO CONFIRMADO|FALLA/i.test(getSatExportFields(r).Estatus_SAT + ' ' + getSatExportFields(r).Resultado_Validacion_SAT)) addAlert(alerts, r, 'MATERIALIDAD', 'MAT-02', 'NARANJA', 'ALERTA NARANJA: Estatus SAT no confirmado. Validar manualmente.', getSatExportFields(r).Estatus_SAT, 'Reintentar validacion SAT o validar manualmente.');\n`;
content = content.replace(alertsOld, '');

const alertsOld2 = `    if (isSatTechnicalFailure(r.estatusSAT) || isSatTechnicalFailure(r.trazabilidadInfo?.observacionSAT)) addAlert(alerts, r, 'MATERIALIDAD', 'MAT-01', 'NARANJA', 'Estatus SAT no confirmado.', r.estatusSAT, 'Validar manualmente antes de usar en devoluciÃ³n/acreditamiento.');\n    if (/cancelado/i.test(r.estatusSAT)) addAlert(alerts, r, 'MATERIALIDAD', 'MAT-02', 'ROJO', 'CFDI cancelado.', r.estatusSAT, 'No usar para acreditamiento/deducciÃ³n sin revisiÃ³n.');`;
const alertsNew2 = `    if (/cancelado/i.test(r.estatusSAT)) addAlert(alerts, r, 'MATERIALIDAD', 'MAT-01', 'ROJO', 'CFDI cancelado.', r.estatusSAT, 'No usar para acreditamiento/deducciÃ³n sin revisiÃ³n.');\n    if (/NO CONFIRMADO|FALLA/i.test(getSatExportFields(r).Estatus_SAT + ' ' + getSatExportFields(r).Resultado_Validacion_SAT) || isSatTechnicalFailure(r.estatusSAT) || isSatTechnicalFailure(r.trazabilidadInfo?.observacionSAT)) addAlert(alerts, r, 'MATERIALIDAD', 'MAT-02', 'NARANJA', 'Estatus SAT no confirmado.', r.estatusSAT || getSatExportFields(r).Estatus_SAT, 'Validar manualmente antes de usar en devoluciÃ³n/acreditamiento.');`;
content = content.replace(alertsOld2, alertsNew2);

const retAlertsOld = `  });\n  return alerts;\n};`;
const retAlertsNew = `  });\n  const uniqueAlerts: any[] = [];\n  const alertSeen = new Set<string>();\n  alerts.forEach(a => {\n    const key = \`\${a.UUID}-\${a.Regla}-\${a.Tipo_Alerta}\`;\n    if (!alertSeen.has(key)) {\n      alertSeen.add(key);\n      uniqueAlerts.push(a);\n    }\n  });\n  return uniqueAlerts;\n};`;
content = content.replace(retAlertsOld, retAlertsNew);

content = content.replace(/Archivo_XML: r\.fileName,\s*UUID: r\.uuid,\s*Serie: r\.serie,/g, "Archivo_XML: r.fileName,\n        UUID: r.uuid,\n        Tipo_Registro: 'CONCEPTO',\n        Serie: r.serie,");
content = content.replace(/REQUIERE CAPTURA/g, 'REQUIERE IMPORTACION');

fs.writeFileSync('client/src/lib/excelExporter.ts', content);
console.log('Done!');
