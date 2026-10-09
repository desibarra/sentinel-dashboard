import 'fake-indexeddb/auto';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { useXMLValidator } from '../hooks/useXMLValidator';
import { buildDiagnosticoWorkbook, buildMainReportWorkbook } from '../lib/excelExporter';

vi.mock('../utils/satStatusValidator', () => ({
  checkCFDIStatusSAT: vi.fn().mockResolvedValue({ estado: 'Vigente' }),
}));

async function validateXml(xmlContent: string): Promise<any> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let result: any;

  await new Promise<void>((resolvePromise, reject) => {
    function Harness() {
      const { validateXMLFiles } = useXMLValidator();
      React.useEffect(() => {
        validateXMLFiles([{ name: '08_FACTURA_USD_TIPO_CAMBIO.xml', size: xmlContent.length, type: 'text/xml', content: xmlContent }], 'Empresa de prueba', 'MME921204H52')
          .then(results => { result = results[0]; resolvePromise(); })
          .catch(reject);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return null;
    }
    const root = createRoot(container);
    act(() => { root.render(React.createElement(Harness)); });
  });

  return result;
}

describe('currency parsing and MXN export characterization', () => {
  it('reads the real USD fixture and exposes its conversion in the main report', async () => {
    const xml = readFileSync(resolve(__dirname, '../../../tests/fixtures/demo-xmls/08_FACTURA_USD_TIPO_CAMBIO.xml'), 'utf8');
    const result = await validateXml(xml);
    const workbook = await buildMainReportWorkbook([result], { name: 'Empresa de prueba', rfc: 'MME921204H52' });
    const legacyWorkbook = await buildDiagnosticoWorkbook([result]);
    const row = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets['CFDI Emitidos'])[0];
    const ivaRows = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets['Cédula IVA']).filter(row => row.Tipo_fila === 'DESGLOSE');
    const legacyVat = XLSX.utils.sheet_to_json<Record<string, any>>(legacyWorkbook.Sheets['CEDULA IVA TRASLADADO'], { range: 1 })
      .reduce((sum, item) => sum + Number(item.IVA || 0), 0);

    expect(result.moneda).toBe('USD');
    expect(result.total).toBe(1160);
    expect(result.tipoCambio).toBe(17.1234);
    expect(row.Subtotal_MXN).toBe(17123.4);
    expect(row.Total_MXN).toBe(19863.14);
    expect(result.desglosePorConcepto).toHaveLength(1);
    expect(ivaRows).toHaveLength(1);
    expect(ivaRows[0]['IVA trasladado emitidas (MXN)']).toBe(2739.74);
    expect(Math.round(ivaRows.reduce((sum, item) => sum + Number(item['IVA trasladado emitidas (MXN)'] || 0), 0) * 100))
      .toBe(Math.round(legacyVat * result.tipoCambio * 100));
    expect(ivaRows[0].Mes_periodo).toBe('2026-03');
    const detailVatRows = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets['Detalle IVA por CFDI']);
    expect(detailVatRows).toHaveLength(1);
    expect(detailVatRows[0].Tasa).toBe('16.00%');
  });

  it('flags a foreign-currency CFDI with no usable exchange rate and leaves converted amounts blank', async () => {
    const xml = readFileSync(resolve(__dirname, '../../../tests/fixtures/demo-xmls/08_FACTURA_USD_TIPO_CAMBIO.xml'), 'utf8')
      .replace(' TipoCambio="17.1234"', '');
    const result = await validateXml(xml);
    const workbook = await buildMainReportWorkbook([result], { name: 'Empresa de prueba', rfc: 'MME921204H52' });
    const detail = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets['CFDI Emitidos'])[0];
    const alerts = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets.Alertas);

    expect(result.tipoCambio).toBeNull();
    expect(detail.Subtotal_MXN).toBe('');
    expect(detail.Total_MXN).toBe('');
    expect(alerts.some(alert => String(alert.Motivo).includes('Tipo de cambio ausente o inválido'))).toBe(true);
  });
});


describe('punto 7: nómina desde XML', () => {
  const payrollXml = () => readFileSync(resolve(__dirname, '../../../tests/fixtures/demo-xmls/08_FACTURA_USD_TIPO_CAMBIO.xml'), 'utf8')
    .replace('TipoDeComprobante="I"', 'TipoDeComprobante="N"')
    .replace('Moneda="USD"', 'Moneda="MXN"')
    .replace('SubTotal="1000.00"', 'SubTotal="10100.00" Descuento="100.00"')
    .replace('Total="1160.00"', 'Total="10000.00"')
    .replace('<cfdi:Complemento>', `<cfdi:Complemento><nomina12:Nomina xmlns:nomina12="http://www.sat.gob.mx/nomina12" Version="1.2" NumDiasPagados="15" TotalPercepciones="10000" TotalOtrosPagos="100" TotalDeducciones="100">
      <nomina12:Percepciones TotalGravado="10000" TotalExento="0"><nomina12:Percepcion ImporteGravado="10000" ImporteExento="0"/></nomina12:Percepciones>
      <nomina12:Deducciones TotalImpuestosRetenidos="100" TotalOtrasDeducciones="0"><nomina12:Deduccion TipoDeduccion="002" Importe="100"/></nomina12:Deducciones>
      <nomina12:OtrosPagos><nomina12:OtroPago Importe="100"/></nomina12:OtrosPagos>
    </nomina12:Nomina>`);

  it('conserva SubTotal y otros pagos sin inventar ISR ni alertar por una tasa estimada', async () => {
    const parsed = await validateXml(payrollXml());
    expect(parsed.subtotal).toBe(10100);
    expect(parsed.totalOtrosPagos).toBe(100);
    expect(parsed.isrRetenidoNomina).toBe(100);
    expect(parsed.diferenciaTotales).toBe(0);
    expect(parsed.comentarioMotor).not.toMatch(/estimaci|heuríst|inconsistencias/i);
    const workbook = await buildMainReportWorkbook([parsed], { rfc: 'MME921204H52' });
    expect(XLSX.utils.sheet_to_json<any>(workbook.Sheets['CFDI Emitidos'])[0].Subtotal).toBe(10100);
  });

  it('detecta un subtotal incongruente aunque el neto cuadre', async () => {
    const parsed = await validateXml(payrollXml().replace('SubTotal="10100.00"', 'SubTotal="10000.00"'));
    expect(parsed.subtotal).toBe(10000);
    expect(parsed.comentarioFiscal).toContain('SubTotal');
    const workbook = await buildMainReportWorkbook([parsed], { rfc: 'MME921204H52' });
    expect(XLSX.utils.sheet_to_json<any>(workbook.Sheets.Alertas).some(a => a.Tipo === 'NÓMINA' && a.Evidencia.includes('SubTotal'))).toBe(true);
  });

  it('detecta diferencias pequeñas reales de total', async () => {
    const parsed = await validateXml(payrollXml().replace('Total="10000.00"', 'Total="9999.00"'));
    expect(parsed.comentarioFiscal).toContain('diferencia');
  });
});
