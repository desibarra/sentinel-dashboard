import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { buildMainReportWorkbook } from '../lib/excelExporter';
import { buildMainReportVat } from '../lib/mainReportVat';
import type { ValidationResult } from '../lib/cfdiEngine';
const invoice = (uuid: string, props: Partial<ValidationResult> = {}) => ({ uuid, tipoCFDI: 'I', direccionCFDI: 'EMITIDO', fechaEmision: '2026-07-01', estatusSAT: 'Vigente', moneda: 'MXN', tipoCambio: 1, metodoPago: 'PUE', subtotal: 100, ivaTraslado: 16, ...props } as ValidationResult);
const rep = (uuid: string, related: string, props: Partial<ValidationResult> = {}) => invoice(uuid, { tipoCFDI: 'P', xmlContent: `<Comprobante><Pagos><Pago FechaPago="2026-07-15" MonedaP="MXN"><DoctoRelacionado IdDocumento="${related}" MonedaDR="MXN" ObjetoImpDR="02"><ImpuestosDR><TrasladosDR><TrasladoDR BaseDR="50" ImpuestoDR="002" TipoFactorDR="Tasa" TasaOCuotaDR="0.16" ImporteDR="8"/></TrasladosDR></ImpuestosDR></DoctoRelacionado></Pago></Pagos></Comprobante>`, ...props });
const total = (r: ReturnType<typeof buildMainReportVat>, field: string, month = '2026-07') => r.totals.filter(x => x.Tipo_fila === 'TOTAL MENSUAL' && x.Mes_periodo === month).reduce((sum, row) => sum + row[field], 0);
const issued = 'IVA trasladado emitidas (MXN)';
const received = 'IVA acreditable pagado recibidas (MXN)';
describe('punto 4: flujo mensual desde impuestos DR', () => {
  it('suma PUE + REP de factura anterior y ausente - NC, sin duplicar PPD ni cancelados', () => {
    const rows = [invoice('PUE'), invoice('OLD', { metodoPago: 'PPD', fechaEmision: '2026-06-01' }), rep('R1', 'OLD'), rep('R2', 'ABSENT'), invoice('NC', { tipoCFDI: 'E', metodoPago: '', ivaTraslado: 4 }), invoice('CANCEL', { estatusSAT: 'Cancelado' }), rep('R3', 'ABSENT', { estatusSAT: 'Cancelado' })];
    const result = buildMainReportVat(rows);
    expect(total(result, issued)).toBe(28);
    expect(total(result, 'IVA_REP_facturas_otros_meses_MXN')).toBe(8);
    expect(total(result, 'IVA_REP_factura_no_localizada_MXN')).toBe(8);
    expect(result.detail.find(x => x.UUID === 'R1')?.Mes_factura).toBe('2026-06');
    expect(result.detail.find(x => x.UUID === 'R2')?.Mes_factura).toBe('NO LOCALIZADA');
    expect(total(result, issued, '2026-06')).toBe(0);
    expect(result.detail.find(x => x.UUID === 'OLD')?.['IVA emitido por cobrar (MXN)']).toBe(8);
    expect(total(buildMainReportVat(rows.map(r => ({ ...r, direccionCFDI: 'RECIBIDO' }))), received)).toBe(28);
  });
  it('asigna cada pago a FechaPago, sin usar mes de emisión del REP', () => {
    const r = rep('R', 'ABSENT', { fechaEmision: '2026-08-03' });
    r.xmlContent = r.xmlContent!.replace('</Pagos>', '<Pago FechaPago="2026-08-02" MonedaP="MXN"><DoctoRelacionado IdDocumento="X" MonedaDR="MXN"><TrasladoDR BaseDR="100" ImpuestoDR="002" TipoFactorDR="Tasa" TasaOCuotaDR="0.08" ImporteDR="8"/></DoctoRelacionado></Pago></Pagos>');
    const result = buildMainReportVat([r]);
    expect(total(result, issued)).toBe(8);
    expect(total(result, issued, '2026-08')).toBe(8);
  });
  it('convierte DR entre monedas con ImporteDR / EquivalenciaDR * TipoCambioP y alerta si falta', () => {
    const r = rep('R', 'ABSENT');
    r.xmlContent = r.xmlContent!.replace('MonedaP="MXN"', 'MonedaP="USD" TipoCambioP="20"').replace('MonedaDR="MXN"', 'MonedaDR="EUR" EquivalenciaDR="0.5"');
    expect(total(buildMainReportVat([r]), issued)).toBe(320);
    r.xmlContent = r.xmlContent.replace(' EquivalenciaDR="0.5"', '');
    const missing = buildMainReportVat([r]);
    expect(missing.alerts.length).toBeGreaterThan(0);
    expect(missing.detail[0][issued]).toBe('');
  });
  it('separa tasas 16, 8, cero, exento y retenciones sin sumar estas al IVA trasladado', () => {
    const r = rep('R', 'ABSENT');
    r.xmlContent = r.xmlContent!.replace('</ImpuestosDR>', '<TrasladoDR BaseDR="100" ImpuestoDR="002" TipoFactorDR="Tasa" TasaOCuotaDR="0" ImporteDR="0"/><TrasladoDR BaseDR="20" ImpuestoDR="002" TipoFactorDR="Exento"/><RetencionDR BaseDR="50" ImpuestoDR="002" TipoFactorDR="Tasa" TasaOCuotaDR="0.04" ImporteDR="2"/></ImpuestosDR>');
    const result = buildMainReportVat([r]);
    expect(total(result, issued)).toBe(8);
    expect(total(result, 'IVA_retenido_MXN')).toBe(2);
    expect(result.detail.map(x => x.Tasa)).toContain('EXENTO');
    expect(result.detail.map(x => x.Tasa)).toContain('0.00%');
  });
  it('el saldo informativo respeta la moneda de factura aunque cambie la cotización del pago', () => {
    const inv = invoice('USD', { metodoPago: 'PPD', moneda: 'USD', tipoCambio: 17 });
    const r = rep('R', 'USD');
    r.xmlContent = r.xmlContent!.replace('MonedaP="MXN"', 'MonedaP="USD" TipoCambioP="18"').replace('MonedaDR="MXN"', 'MonedaDR="USD"');
    const result = buildMainReportVat([inv, r]);
    expect(total(result, issued)).toBe(144);
    expect(total(result, 'IVA emitido por cobrar (MXN)')).toBe(136);
  });

  it('exporta totales mensuales, detalle DR y alertas dentro del libro real', async () => {
    const base = { rfcEmisor: 'EMP010101EMP', rfcReceptor: 'CLI010101CLI', fileName: 'test.xml', total: 0, resultado: '🟢 USABLE', esNomina: 'NO' } as Partial<ValidationResult>;
    const id = '00000000-0000-4000-8000-000000000091';
    const workbook = await buildMainReportWorkbook([rep(id, 'ABSENT', base)], { rfc: 'EMP010101EMP' });
    const totals = XLSX.utils.sheet_to_json<any>(workbook.Sheets['Cédula IVA']);
    expect(totals.find(r => r.Tipo_fila === 'TOTAL MENSUAL')[issued]).toBe(8);
    const detail = XLSX.utils.sheet_to_json<any>(workbook.Sheets['Detalle IVA por CFDI']);
    expect(detail[0].UUID_REP).toBe(id);
    expect(detail[0].IVA_REP_factura_no_localizada_MXN).toBe(8);
    expect(detail[0].Factura_en_lote).toBe('NO LOCALIZADA');
    expect(detail[0].Mes_factura).toBe('NO LOCALIZADA');
    const repRow = XLSX.utils.sheet_to_json<any>(workbook.Sheets['CFDI Emitidos'])[0];
    expect(repRow.Comentario).toContain('REP: paga 1 factura(s) no incluida(s) en el lote');
    const serialized = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true });
    expect(XLSX.read(serialized).SheetNames).toContain('Detalle IVA por CFDI');
  });

  it('explica en cada fila y en el REP cuándo se paga una factura de otro mes o fuera del lote', () => {
    const old = invoice('OLD', { metodoPago: 'PPD', fechaEmision: '2026-06-10' });
    const r = rep('R', 'ABSENT', { fechaEmision: '2026-07-20' });
    r.xmlContent = r.xmlContent!.replace('</Pago></Pagos>', '</Pago><Pago FechaPago="2026-07-18" MonedaP="MXN"><DoctoRelacionado IdDocumento="OLD" MonedaDR="MXN"><TrasladoDR BaseDR="50" ImpuestoDR="002" TipoFactorDR="Tasa" TasaOCuotaDR="0.16" ImporteDR="8"/></DoctoRelacionado></Pago></Pagos>');
    const late = rep('LATE', 'ABSENT2', { fechaEmision: '2026-08-02' });
    const result = buildMainReportVat([old, r, late]);
    const row = (uuid: string, related: string) => result.detail.find(x => x.UUID === uuid && x.UUID_factura === related)!;
    expect(row('R', 'ABSENT').Observación).toContain('no está en el lote');
    expect(row('R', 'OLD').Observación).toContain('factura de 2026-06 incluida en el lote; el IVA se acumula en 2026-07');
    expect(row('OLD', 'OLD').Observación).toContain('Factura PPD');
    expect(row('LATE', 'ABSENT2').Observación).toContain('verificar si ya se declaró');
    expect(result.repNotes.get('R')).toContain('1 factura(s) no incluida(s) en el lote');
    expect(result.repNotes.get('R')).toContain('1 factura(s) del lote de otro mes (2026-06)');
    expect(result.repNotes.get('LATE')).toContain('FechaPago anterior a su emisión');
    const lateAlert = result.alerts.find(a => a.UUID === 'LATE')!;
    expect(lateAlert.Nivel_Riesgo).toBe('INFO');
    expect(lateAlert.Descripcion_Tecnica).toContain('2026-07');
    expect(result.alerts.some(a => a.UUID === 'R')).toBe(false);
  });

  it('no inventa IVA en REP sin DR y evita volver a contar una factura PUE', () => {
    const r = rep('R', 'PUE');
    expect(total(buildMainReportVat([invoice('PUE'), r]), issued)).toBe(16);
    r.xmlContent = '<Comprobante><Pagos><Pago FechaPago="2026-07-01" MonedaP="MXN"><DoctoRelacionado IdDocumento="ABSENT" MonedaDR="MXN"/></Pago></Pagos></Comprobante>';
    expect(buildMainReportVat([r]).alerts).toHaveLength(1);
  });
});
