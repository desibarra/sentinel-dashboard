const fs = require('fs');

let content = fs.readFileSync('client/src/lib/excelExporter.ts', 'utf8');

// 1. Inyectar lógica de mapeo antes de la variable 'data'
const mappingLogic = 
  // --- INICIO LÓGICA DE HOMOLOGACIÓN CARTA PORTE ---
  const uuidMap = new Map<string, any>();
  
  // 1a. Registrar todos los CFDI principales
  validResults.forEach(r => {
    uuidMap.set(r.uuid, {
      uuid: r.uuid,
      isPrincipal: true,
      tipoCFDI: r.tipoCFDI,
      tieneCPPrincipal: r.cartaPorte === 'SÍ',
      versionCP: r.versionCartaPorte || 'NO_DETECTADA',
      isRelated: false,
      parentRefs: []
    });
  });

  // 1b. Registrar las referencias relacionadas
  validResults.forEach(r => {
    if (r.uuids_relacionados && r.uuids_relacionados.length > 0) {
      r.uuids_relacionados.forEach(relUuid => {
        if (!uuidMap.has(relUuid)) {
          uuidMap.set(relUuid, {
            uuid: relUuid,
            isPrincipal: false,
            tipoCFDI: 'NO APLICA',
            tieneCPPrincipal: false,
            versionCP: 'NO APLICA',
            isRelated: true,
            parentRefs: []
          });
        }
        
        const relNode = uuidMap.get(relUuid);
        relNode.isRelated = true;
        relNode.parentRefs.push({
          parentUuid: r.uuid,
          parentTipoCFDI: r.tipoCFDI,
          parentTieneCP: r.cartaPorte === 'SÍ',
          parentVersionCP: r.versionCartaPorte || 'NO_DETECTADA',
          tipoRelacion: r.tipoRelacion || 'NO APLICA'
        });
      });
    }
  });

  // 1c. Calcular Rol y Estatus
  uuidMap.forEach(node => {
    if (node.isPrincipal && node.isRelated) {
      node.rolUUID = 'CFDI_PRINCIPAL_Y_RELACIONADO';
    } else if (node.isPrincipal) {
      node.rolUUID = 'CFDI_PRINCIPAL';
    } else if (node.isRelated) {
      node.rolUUID = 'UUID_RELACIONADO';
    } else {
      node.rolUUID = 'NO_ENCONTRADO';
    }

    if (node.isPrincipal) {
      if (node.tieneCPPrincipal) {
        node.estatusCP = 'CP_PRESENTE_EN_XML_PRINCIPAL';
      } else if (node.tipoCFDI === 'E' || node.tipoCFDI === 'P') {
        node.estatusCP = 'CP_NO_APLICA_POR_TIPO_CFDI';
      } else {
        // Verificar si algún padre o hijo tiene CP
        const hasParentWithCP = node.parentRefs.some((p: any) => p.parentTieneCP);
        if (hasParentWithCP) {
          node.estatusCP = 'CP_NO_PRESENTE_CON_RELACION_A_CP';
        } else {
          node.estatusCP = 'CP_NO_DETECTADA_REVISAR';
        }
      }
    } else {
      node.estatusCP = 'CP_XML_RELACIONADO';
    }
  });
  // --- FIN LÓGICA DE HOMOLOGACIÓN CARTA PORTE ---

;

content = content.replace(
    '// Preparar datos en el orden exacto de columnas', 
    mappingLogic + '\n  // Preparar datos en el orden exacto de columnas'
);

// 2. Inyectar columnas a Diagnostico_CFDI
const injectColumns = 
      Es_Nomina: r.esNomina,
      Version_Nomina: r.versionNomina,
      Rol_del_UUID_en_el_lote: uuidMap.get(r.uuid)?.rolUUID || 'NO_ENCONTRADO',
      Estatus_Carta_Porte_Homologado: uuidMap.get(r.uuid)?.estatusCP || 'CP_NO_DETECTADA_REVISAR',
      Tipo_Relacion_CFDI: r.tipoRelacion || 'NO APLICA',
      Version_Carta_Porte_Homologado: uuidMap.get(r.uuid)?.versionCP || 'NO_DETECTADA',
      Requiere_Carta_Porte: r.requiereCartaPorte,;

content = content.replace(
    '      Es_Nomina: r.esNomina,\n      Version_Nomina: r.versionNomina,\n      Requiere_Carta_Porte: r.requiereCartaPorte,', 
    injectColumns
);

// 3. Crear las nuevas hojas
const injectSheets = 
  // --- NUEVA HOJA: Trazabilidad_UUID ---
  const dataTrazabilidadUUID: any[] = [];
  uuidMap.forEach(node => {
    if (node.isPrincipal && !node.isRelated) {
      dataTrazabilidadUUID.push({
        'UUID buscado': node.uuid,
        'Aparece como': node.rolUUID,
        'UUID principal donde aparece': 'MISMO (ES PRINCIPAL)',
        'Tipo CFDI principal': node.tipoCFDI,
        'Tipo relación CFDI': 'NO APLICA',
        'Tiene Carta Porte principal': node.tieneCPPrincipal ? 'SÍ' : 'NO',
        'Versión Carta Porte principal': node.versionCP,
        'Tiene Carta Porte relacionada': 'NO APLICA',
        'Estatus Carta Porte Homologado': node.estatusCP,
        'Observación técnica': 'Es CFDI principal sin referencias.'
      });
    } else if (node.isRelated) {
      node.parentRefs.forEach((pref: any) => {
        dataTrazabilidadUUID.push({
          'UUID buscado': node.uuid,
          'Aparece como': node.rolUUID,
          'UUID principal donde aparece': pref.parentUuid,
          'Tipo CFDI principal': pref.parentTipoCFDI,
          'Tipo relación CFDI': pref.tipoRelacion,
          'Tiene Carta Porte principal': pref.parentTieneCP ? 'SÍ' : 'NO',
          'Versión Carta Porte principal': pref.parentVersionCP,
          'Tiene Carta Porte relacionada': node.isPrincipal ? (node.tieneCPPrincipal ? 'SÍ' : 'NO') : 'NO APLICA',
          'Estatus Carta Porte Homologado': node.estatusCP,
          'Observación técnica': node.isPrincipal ? 'CFDI principal referenciado por otro.' : 'Solo existe como nodo relacionado.'
        });
      });
    }
  });
  
  const wsTrazabilidadUUID = (XLSX as any).utils.json_to_sheet(dataTrazabilidadUUID);
  (XLSX as any).utils.book_append_sheet(wb, wsTrazabilidadUUID, 'Trazabilidad_UUID');

  // --- NUEVA HOJA: Resumen_Carta_Porte_Homologado ---
  let totalXML = validResults.length + invalidResults.length;
  let cpPresente = 0;
  let cpSinCP = 0;
  let uuidRelTotal = 0;
  let uuidRelApuntaCP = 0;
  let cfdiEP = 0;
  let rel04 = 0;
  let rel01 = 0;
  let aRevisar = 0;

  uuidMap.forEach(node => {
    if (node.isPrincipal) {
      if (node.estatusCP === 'CP_PRESENTE_EN_XML_PRINCIPAL') cpPresente++;
      if (node.estatusCP === 'CP_NO_DETECTADA_REVISAR' || node.estatusCP === 'CP_NO_PRESENTE_CON_RELACION_A_CP') cpSinCP++;
      if (node.estatusCP === 'CP_NO_APLICA_POR_TIPO_CFDI') cfdiEP++;
      if (node.estatusCP === 'CP_NO_DETECTADA_REVISAR') aRevisar++;
    } else {
      uuidRelTotal++;
      if (node.parentRefs.some((p: any) => p.parentTieneCP)) uuidRelApuntaCP++;
    }
    
    if (node.isRelated) {
      node.parentRefs.forEach((p: any) => {
        if (p.tipoRelacion === '04') rel04++;
        if (p.tipoRelacion === '01') rel01++;
      });
    }
  });

  const dataResumenHomologado = [
    { Indicador: 'Total XML cargados', Valor: totalXML },
    { Indicador: 'Total CFDI principales con Carta Porte', Valor: cpPresente },
    { Indicador: 'Total CFDI principales sin Carta Porte', Valor: cpSinCP },
    { Indicador: 'Total UUID relacionados detectados (puros)', Valor: uuidRelTotal },
    { Indicador: 'Total UUID relacionados que apuntan a CFDI con Carta Porte', Valor: uuidRelApuntaCP },
    { Indicador: 'Total CFDI tipo E/P marcados como NO APLICA', Valor: cfdiEP },
    { Indicador: 'Total CFDI con relación tipo 04 sustitución', Valor: rel04 },
    { Indicador: 'Total CFDI con relación tipo 01 nota de crédito', Valor: rel01 },
    { Indicador: 'Total inconsistencias a revisar', Valor: aRevisar },
  ];

  const wsResumenHomologado = (XLSX as any).utils.json_to_sheet(dataResumenHomologado);
  (XLSX as any).utils.book_append_sheet(wb, wsResumenHomologado, 'Resumen_CP_Homologado');

;

content = content.replace(
    "  (XLSX as any).utils.book_append_sheet(wb, wsErrores, 'ERRORES LECTURA XML');",
    "  (XLSX as any).utils.book_append_sheet(wb, wsErrores, 'ERRORES LECTURA XML');\n\n" + injectSheets
);

fs.writeFileSync('client/src/lib/excelExporter.ts', content, 'utf8');
console.log("Archivo modificado correctamente");
