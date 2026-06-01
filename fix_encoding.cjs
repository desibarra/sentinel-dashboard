const fs = require('fs');
let content = fs.readFileSync('client/src/lib/excelExporter.ts', 'utf8');

// We'll replace the block that creates Trazabilidad_UUID
const startTag = "// --- NUEVA HOJA: Trazabilidad_UUID ---";
const endTag = "// --- NUEVA HOJA: Resumen_Carta_Porte_Homologado ---";

const startIdx = content.indexOf(startTag);
const endIdx = content.indexOf(endTag);

if (startIdx !== -1 && endIdx !== -1) {
  const replacement = // --- NUEVA HOJA: Trazabilidad_UUID ---
  const dataTrazabilidadUUID: any[] = [];
  uuidMap.forEach(node => {
    if (node.isPrincipal && !node.isRelated) {
      dataTrazabilidadUUID.push({
        'UUID buscado': node.uuid,
        'Aparece como': node.rolUUID,
        'UUID principal donde aparece': 'MISMO (ES PRINCIPAL)',
        'Tipo CFDI principal': node.tipoCFDI,
        'Tipo relacion CFDI': 'NO APLICA',
        'Tiene Carta Porte principal': node.tieneCPPrincipal ? 'SI' : 'NO',
        'Version Carta Porte principal': node.versionCP,
        'Tiene Carta Porte relacionada': 'NO APLICA',
        'Estatus Carta Porte Homologado': node.estatusCP,
        'Observacion tecnica': 'Es CFDI principal sin referencias.'
      });
    } else if (node.isRelated) {
      node.parentRefs.forEach((pref: any) => {
        dataTrazabilidadUUID.push({
          'UUID buscado': node.uuid,
          'Aparece como': node.rolUUID,
          'UUID principal donde aparece': pref.parentUuid,
          'Tipo CFDI principal': pref.parentTipoCFDI,
          'Tipo relacion CFDI': pref.tipoRelacion,
          'Tiene Carta Porte principal': pref.parentTieneCP ? 'SI' : 'NO',
          'Version Carta Porte principal': pref.parentVersionCP,
          'Tiene Carta Porte relacionada': node.isPrincipal ? (node.tieneCPPrincipal ? 'SI' : 'NO') : 'NO APLICA',
          'Estatus Carta Porte Homologado': node.estatusCP,
          'Observacion tecnica': node.isPrincipal ? 'CFDI principal referenciado por otro XML.' : 'Solo existe como nodo relacionado dentro del CFDI principal.'
        });
      });
    }
  });
  
  const wsTrazabilidadUUID = (XLSX as any).utils.json_to_sheet(dataTrazabilidadUUID);
  (XLSX as any).utils.book_append_sheet(wb, wsTrazabilidadUUID, 'Trazabilidad_UUID');

  ;
  
  content = content.substring(0, startIdx) + replacement + content.substring(endIdx);
  fs.writeFileSync('client/src/lib/excelExporter.ts', content, 'utf8');
}
