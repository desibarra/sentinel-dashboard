import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { useXMLValidator } from '../hooks/useXMLValidator';
import { buildMainReportWorkbook } from '../lib/excelExporter';

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
    const row = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets['CFDI Emitidos'])[0];

    expect(result.moneda).toBe('USD');
    expect(result.total).toBe(1160);
    expect(result.tipoCambio).toBe(17.1234);
    expect(row.Subtotal_MXN).toBe(17123.4);
    expect(row.Total_MXN).toBe(19863.14);
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
