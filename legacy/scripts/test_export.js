const XLSX = require('xlsx');

const results = [
  {
    fileName: '01_CFDI_Con_Carta_Porte.xml', uuid: '11111111-1111-1111-1111-111111111111', tipoCFDI: 'I', subtotal: 1000, ivaTraslado: 160, total: 1160, 
    desglosePorConcepto: [{concepto: 'Flete'}], trazabilidadInfo: { exportacion: '01', tieneCartaPorte: 'S?', tieneOrigen: 'CDMX', tieneDestino: 'MTY', tienePlacasUnidad: 'S?', nivelExpediente: 'LOG?STICA SIN SOPORTE ADUANAL', accionRecomendadaMatriz: 'Solicitar Pedimento' }
  },
  {
    fileName: '02_CFDI_Sin_Carta_Porte.xml', uuid: '22222222-2222-2222-2222-222222222222', tipoCFDI: 'I', subtotal: 500, ivaTraslado: 80, total: 580,
    desglosePorConcepto: [{concepto: 'Acarreo'}], trazabilidadInfo: { exportacion: '01', tieneCartaPorte: 'No', nivelExpediente: 'NO APTO PARA TRAZABILIDAD ADUANERA DIRECTA', datosFaltantes: 'Carta Porte', diagnosticoDatosFaltantes: 'FALTA CARTA PORTE' }
  },
  {
    fileName: '03_CFDI_Tasa_0.xml', uuid: '33333333-3333-3333-3333-333333333333', tipoCFDI: 'I', subtotal: 10000, ivaTraslado: 0, total: 10000, baseIVA0: 10000,
    desglosePorConcepto: [{concepto: 'Exportacion Sillas'}], trazabilidadInfo: { exportacion: '02', tienePedimento: 'No', diagnosticoTasa0: 'RIESGO EN TASA 0% / REQUIERE SOPORTE', accionRecomendadaTasa0: 'Recabar Pedimento' }
  },
  {
    fileName: '04_CFDI_Multiples_Conceptos.xml', uuid: '44444444-4444-4444-4444-444444444444', tipoCFDI: 'I', subtotal: 300, ivaTraslado: 48, total: 348,
    desglosePorConcepto: [{concepto: 'Silla'}, {concepto: 'Silla'}, {concepto: 'Mesa'}], trazabilidadInfo: { exportacion: '01', nivelExpediente: 'SOPORTE FISCAL PARCIAL' }
  },
  {
    fileName: '05_CFDI_Sin_Pedimento.xml', uuid: '55555555-5555-5555-5555-555555555555', tipoCFDI: 'I', baseIVA0: 5000,
    desglosePorConcepto: [{concepto: 'Mercancia Extranjera'}], trazabilidadInfo: { exportacion: '02', tienePedimento: 'No', nivelExpediente: 'SOPORTE FISCAL PARCIAL' }
  },
  {
    fileName: '06_CFDI_No_Objeto.xml', uuid: '66666666-6666-6666-6666-666666666666', tipoCFDI: 'I', baseNoObjeto: 1000,
    desglosePorConcepto: [{concepto: 'Servicio No Objeto'}], trazabilidadInfo: { exportacion: '01' }
  },
  {
    fileName: '07_CFDI_Exento.xml', uuid: '77777777-7777-7777-7777-777777777777', tipoCFDI: 'I', baseIVAExento: 2000,
    desglosePorConcepto: [{concepto: 'Libros'}], trazabilidadInfo: { exportacion: '01' }
  },
  {
    fileName: '08_CFDI_Sin_DODA.xml', uuid: '88888888-8888-8888-8888-888888888888', tipoCFDI: 'I', baseIVA0: 8000,
    desglosePorConcepto: [{concepto: 'Transp Fronterizo'}], trazabilidadInfo: { exportacion: '02', tienePedimento: 'S?', pedimento: '12 34 5678', tieneDoda: 'No', nivelExpediente: 'SOPORTE ADUANERO PARCIAL' }
  },
  {
    fileName: '09_CFDI_Datos_Incompletos.xml', uuid: '99999999-9999-9999-9999-999999999999', tipoCFDI: 'I',
    desglosePorConcepto: [{concepto: 'Generico'}], trazabilidadInfo: { exportacion: '01', identificadorBancario: '', banco: '' }
  },
  {
    fileName: '10_CFDI_Fiscalmente_Usable.xml', uuid: 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA', tipoCFDI: 'E', rfcReceptor: 'AAA010101AAA', rfcEmisor: 'BBB010101BBB', ivaTraslado: 500,
    desglosePorConcepto: [{concepto: 'Papeleria'}], trazabilidadInfo: { exportacion: '01', ivaAcreditable: 500, identificadorBancario: 'Transfer 123', fechaPago: '2026-05-20' }
  }
];

const wb = XLSX.utils.book_new();

const dataTasa0 = results.filter(r => (r.baseIVA0 || 0) > 0).map(r => ({
  UUID: r.uuid,
  Concepto: r.desglosePorConcepto ? Array.from(new Set(r.desglosePorConcepto.map(c => c.concepto))).join(' | ') : 'NO VIENE EN XML',
  Exportacion: r.trazabilidadInfo?.exportacion || 'NO DISPONIBLE',
  Tiene_Carta_Porte: r.trazabilidadInfo?.tieneCartaPorte || 'NO',
  Tiene_Pedimento: r.trazabilidadInfo?.tienePedimento || 'NO',
  Tiene_DODA: r.trazabilidadInfo?.tieneDoda || 'NO',
  Diagnostico_Tasa_0: r.trazabilidadInfo?.diagnosticoTasa0 || 'NO APLICA',
  Accion_Recomendada: r.trazabilidadInfo?.accionRecomendadaTasa0 || 'NO APLICA'
}));
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataTasa0), 'CEDULA TASA 0%');

const dataFaltantes = results.map(r => ({
  UUID: r.uuid,
  Tiene_Carta_Porte: r.trazabilidadInfo?.tieneCartaPorte || 'NO',
  Tiene_Pedimento: r.trazabilidadInfo?.tienePedimento || 'NO',
  Datos_Faltantes: r.trazabilidadInfo?.datosFaltantes || 'NO APLICA',
  Fuente_Externa_Requerida: r.trazabilidadInfo?.fuenteExternaRequerida || 'NO APLICA',
  Diagnostico: r.trazabilidadInfo?.diagnosticoDatosFaltantes || 'NO APLICA',
  Accion_Recomendada: r.trazabilidadInfo?.accionRecomendadaDatosFaltantes || 'NO APLICA'
}));
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataFaltantes), 'ANEXO DATOS FALTANTES');

const dataMatriz = results.map(r => ({
  UUID: r.uuid,
  Origen: r.trazabilidadInfo?.tieneOrigen || 'NO VIENE EN XML',
  Pedimento: r.trazabilidadInfo?.pedimento || 'NO VIENE EN XML',
  Pago_Identificado: r.trazabilidadInfo?.identificadorBancario || 'REQUIERE CRUCE EXTERNO',
  Nivel_De_Expediente: r.trazabilidadInfo?.nivelExpediente || 'NO APLICA',
  Accion_Recomendada: r.trazabilidadInfo?.accionRecomendadaMatriz || 'NO APLICA'
}));
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataMatriz), 'MATRIZ DE RASTREABILIDAD');

XLSX.writeFile(wb, 'Test_Final_Corregido.xlsx');
