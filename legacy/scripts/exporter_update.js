const fs = require('fs');
let code = fs.readFileSync('client/src/lib/excelExporter.ts', 'utf8');

const newDataCols = \
    Giro_Empresa: r.giroEmpresa || 'NO DEFINIDO',
    UUIDs_Relacionados: r.uuids_relacionados?.join(', ') || 'NO APLICA',
    Nivel_Trazabilidad: r.trazabilidadInfo?.nivelExpediente || 'NO APLICA',
    Requiere_Soporte_Externo: r.trazabilidadInfo?.fuenteExternaRequerida || 'NO',
    Accion_Recomendada: r.trazabilidadInfo?.accionRecomendadaMatriz || 'NO APLICA',
\;
code = code.replace(/    Giro_Empresa: r.giroEmpresa \|\| 'NO DEFINIDO',\s*UUIDs_Relacionados: r.uuids_relacionados\?\.join\(\', \'\) \|\| \'NO APLICA\',/, newDataCols);

const newWidths = \
    { wch: 20 }, // BL: Giro_Empresa
    { wch: 60 }, // BM: UUIDs_Relacionados
    { wch: 25 }, // BN: Nivel_Trazabilidad
    { wch: 20 }, // BO: Requiere_Soporte_Externo
    { wch: 30 }, // BP: Accion_Recomendada
  ];
\;
code = code.replace(/    { wch: 20 }, \/\/ BL: Giro_Empresa\s*\{ wch: 60 \}, \/\/ BM: UUIDs_Relacionados\s*\];/, newWidths);

code = code.replace("ref: \A1:BM1\", "ref: \A1:BP1\");

const sheetsCode = \
  (XLSX as any).utils.book_append_sheet(wb, ws, 'Diagnostico_CFDI');

  // 1. CEDULA INGRESOS SAT
  const dataIngresos = results.filter(r => r.tipoCFDI === 'I').map(r => ({
    UUID: r.uuid,
    Serie: r.serie,
    Folio: r.folio,
    Fecha: r.fechaEmision,
    RFC_Receptor: r.rfcReceptor,
    Nombre_Receptor: r.nombreReceptor,
    Concepto: r.desglosePorConcepto?.map(c => c.concepto).join(', ') || '',
    Subtotal: r.subtotal,
    IVA: r.ivaTraslado,
    Total: r.total,
    Metodo_Pago: r.metodoPago,
    Forma_Pago: r.formaPago,
    Estatus_CFDI: r.estatusSAT,
    Fecha_Cobro: r.trazabilidadInfo?.fechaCobro,
    Folio_Transferencia: r.trazabilidadInfo?.folioTransferencia,
    Banco: r.trazabilidadInfo?.banco,
    Identificador_Bancario: r.trazabilidadInfo?.identificadorBancario,
    Observacion_SAT: r.trazabilidadInfo?.observacionSAT
  }));
  const wsIngresos = (XLSX as any).utils.json_to_sheet(dataIngresos);
  (XLSX as any).utils.book_append_sheet(wb, wsIngresos, 'CEDULA INGRESOS SAT');

  // 2. CEDULA TASA 0%
  const dataTasa0 = results.filter(r => (r.baseIVA0 || 0) > 0).map(r => ({
    UUID: r.uuid,
    Fecha: r.fechaEmision,
    RFC_Receptor: r.rfcReceptor,
    Nombre_Receptor: r.nombreReceptor,
    Concepto: r.desglosePorConcepto?.map(c => c.concepto).join(', ') || '',
    Base_Tasa_0: r.baseIVA0,
    IVA_Trasladado_0: 0,
    Exportacion: r.desglosePorConcepto?.map(c => c.objetoImp).join(', ') || 'NO DISPONIBLE',
    Tiene_Carta_Porte: r.trazabilidadInfo?.tieneCartaPorte,
    Origen: r.trazabilidadInfo?.tieneOrigen,
    Destino: r.trazabilidadInfo?.tieneDestino,
    Destino_Extranjero: r.trazabilidadInfo?.destinoExtranjero,
    Tiene_Pedimento: r.trazabilidadInfo?.tienePedimento,
    Pedimento: r.trazabilidadInfo?.pedimento,
    Tiene_DODA: r.trazabilidadInfo?.tieneDoda,
    Numero_DODA_Integracion: r.trazabilidadInfo?.numeroDodaIntegracion,
    Soporte_Comercio_Exterior: r.trazabilidadInfo?.soporteComercioExterior,
    Diagnostico_Tasa_0: r.trazabilidadInfo?.diagnosticoTasa0,
    Accion_Recomendada: r.trazabilidadInfo?.accionRecomendadaTasa0
  }));
  const wsTasa0 = (XLSX as any).utils.json_to_sheet(dataTasa0);
  (XLSX as any).utils.book_append_sheet(wb, wsTasa0, 'CEDULA TASA 0%');

  // 3. CEDULA IVA ACREDITABLE
  const dataIvaAcreditable = results.filter(r => r.tipoCFDI === 'E' || (r.tipoCFDI === 'I' && r.rfcReceptor && !r.rfcReceptor.startsWith('XEXX') && r.rfcEmisor !== r.rfcReceptor)).map(r => ({
    UUID: r.uuid,
    Fecha: r.fechaEmision,
    RFC_Emisor: r.rfcEmisor,
    Nombre_Emisor: r.nombreEmisor,
    Concepto: r.desglosePorConcepto?.map(c => c.concepto).join(', ') || '',
    Subtotal: r.subtotal,
    IVA_Acreditable: r.trazabilidadInfo?.ivaAcreditable,
    Total: r.total,
    Metodo_Pago: r.metodoPago,
    Forma_Pago: r.formaPago,
    Estatus_CFDI: r.estatusSAT,
    Uso_CFDI: r.usoCFDI,
    Regimen_Emisor: r.regimenEmisor,
    Identificacion_Bancaria: r.trazabilidadInfo?.identificadorBancario,
    Fecha_Pago: r.trazabilidadInfo?.fechaPago,
    Folio_Transferencia: r.trazabilidadInfo?.folioTransferencia,
    Diagnostico_IVA_Acreditable: r.trazabilidadInfo?.diagnosticoIvaAcreditable,
    Accion_Recomendada: r.trazabilidadInfo?.accionRecomendadaIvaAcreditable
  }));
  const wsIvaAcreditable = (XLSX as any).utils.json_to_sheet(dataIvaAcreditable);
  (XLSX as any).utils.book_append_sheet(wb, wsIvaAcreditable, 'CEDULA IVA ACREDITABLE');

  // 4. ANEXO DATOS FALTANTES
  const dataFaltantes = results.map(r => ({
    UUID: r.uuid,
    Serie: r.serie,
    Folio: r.folio,
    Fecha: r.fechaEmision,
    RFC_Emisor: r.rfcEmisor,
    RFC_Receptor: r.rfcReceptor,
    Tipo_CFDI: r.tipoCFDI,
    Tiene_Carta_Porte: r.trazabilidadInfo?.tieneCartaPorte,
    Tiene_Placas_Unidad: r.trazabilidadInfo?.tienePlacasUnidad,
    Tiene_Origen: r.trazabilidadInfo?.tieneOrigen,
    Tiene_Destino: r.trazabilidadInfo?.tieneDestino,
    Tiene_Mercancias: r.trazabilidadInfo?.tieneMercancias,
    Tiene_Pedimento: r.trazabilidadInfo?.tienePedimento,
    Tiene_DODA: r.trazabilidadInfo?.tieneDoda,
    Tiene_Entry: r.trazabilidadInfo?.tieneEntryNumber,
    Tiene_Identificacion_Bancaria: r.trazabilidadInfo?.identificadorBancario,
    Datos_Faltantes: r.trazabilidadInfo?.datosFaltantes,
    Fuente_Externa_Requerida: r.trazabilidadInfo?.fuenteExternaRequerida,
    Diagnostico: r.trazabilidadInfo?.diagnosticoDatosFaltantes,
    Accion_Recomendada: r.trazabilidadInfo?.accionRecomendadaDatosFaltantes,
    Se_Puede_Auditar_Con_Este_XML_Solamente: r.trazabilidadInfo?.auditableSoloConXML
  }));
  const wsFaltantes = (XLSX as any).utils.json_to_sheet(dataFaltantes);
  (XLSX as any).utils.book_append_sheet(wb, wsFaltantes, 'ANEXO DATOS FALTANTES');

  // 5. MATRIZ DE RASTREABILIDAD
  const dataMatriz = results.map(r => ({
    UUID: r.uuid,
    Factura: \\-\\,
    Cliente_Proveedor: r.tipoCFDI === 'I' ? r.nombreReceptor : r.nombreEmisor,
    Fecha: r.fechaEmision,
    Unidad_Placas: r.trazabilidadInfo?.tienePlacasUnidad,
    Origen: r.trazabilidadInfo?.tieneOrigen,
    Destino: r.trazabilidadInfo?.tieneDestino,
    Mercancia: r.trazabilidadInfo?.tieneMercancias,
    Pedimento: r.trazabilidadInfo?.pedimento,
    DODA: r.trazabilidadInfo?.tieneDoda,
    Entry: r.trazabilidadInfo?.tieneEntryNumber,
    Pago_Identificado: r.trazabilidadInfo?.identificadorBancario,
    Estado_De_Cuenta: r.trazabilidadInfo?.estadoDeCuenta,
    Soporte_Comercio_Exterior: r.trazabilidadInfo?.soporteComercioExterior,
    Nivel_De_Expediente: r.trazabilidadInfo?.nivelExpediente,
    Estatus_Documental: r.trazabilidadInfo?.estatusDocumental,
    Riesgo: r.trazabilidadInfo?.riesgo,
    Accion_Recomendada: r.trazabilidadInfo?.accionRecomendadaMatriz
  }));
  const wsMatriz = (XLSX as any).utils.json_to_sheet(dataMatriz);
  (XLSX as any).utils.book_append_sheet(wb, wsMatriz, 'MATRIZ DE RASTREABILIDAD');
\;

code = code.replace("(XLSX as any).utils.book_append_sheet(wb, ws, 'Diagnostico_CFDI');", sheetsCode);

fs.writeFileSync('client/src/lib/excelExporter.ts', code, 'utf8');
