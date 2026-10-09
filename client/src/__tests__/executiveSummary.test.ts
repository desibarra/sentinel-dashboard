import { describe, expect, it } from 'vitest';
import { buildMainReportWorkbook } from '../lib/excelExporter';
import { ValidationResult } from '../lib/cfdiEngine';
import * as XLSX from 'xlsx';

describe('Executive Summary (Hoja Resumen)', () => {
  it('genera la hoja Resumen como la primera hoja con cálculos correctos', async () => {
    const cfdis: ValidationResult[] = [
      // Verde / PUE Válido / Acreditable
      {
        uuid: 'UUID-VERDE-PUE',
        tipoCFDI: 'I',
        metodoPago: 'PUE',
        trazabilidadInfo: { fechaCobro: '2026-06-10' },
        ivaTraslado: 100,
        isValid: true,
        estatusSAT: 'Vigente',
        fiscalRiskLevel: 'VERDE',
        paymentMethodStatus: 'PUE_VALIDO',
        paymentComplementStatus: 'NO APLICA',
        ivaCreditabilityStatus: 'ACREDITABLE',
        resultado: '🟢 OK',
        total: 1000,
      } as unknown as ValidationResult,
      // Amarillo / PUE Revisar Cobro / Acreditable
      {
        uuid: 'UUID-AMARILLO-PUE',
        tipoCFDI: 'I',
        metodoPago: 'PUE',
        trazabilidadInfo: {},
        ivaTraslado: 200,
        isValid: true,
        estatusSAT: 'Vigente',
        fiscalRiskLevel: 'AMARILLO',
        paymentMethodStatus: 'PUE_REVISAR_COBRO',
        paymentComplementStatus: 'NO APLICA',
        ivaCreditabilityStatus: 'ACREDITABLE',
        resultado: '🟡 ALERTA',
        total: 2000,
      } as unknown as ValidationResult,
      // Rojo / PPD sin complemento / No Acreditable
      {
        uuid: 'UUID-ROJO-PPD-SIN',
        tipoCFDI: 'I',
        metodoPago: 'PPD',
        pagosPresente: 'NO',
        pagosValido: 'NO',
        ivaTraslado: 300,
        isValid: true,
        estatusSAT: 'Vigente',
        fiscalRiskLevel: 'ROJO',
        paymentMethodStatus: 'PPD_SIN_COMPLEMENTO',
        paymentComplementStatus: 'SIN_COMPLEMENTO',
        ivaCreditabilityStatus: 'NO_ACREDITABLE',
        resultado: '🔴 NO USABLE',
        total: 3000,
      } as unknown as ValidationResult,
      // Rojo / PPD con complemento fuera de periodo / Acreditable
      {
        uuid: 'UUID-ROJO-PPD-FUERA',
        tipoCFDI: 'I',
        metodoPago: 'PPD',
        ivaTraslado: 400,
        isValid: true,
        estatusSAT: 'Vigente',
        fiscalRiskLevel: 'ROJO',
        paymentMethodStatus: 'PPD_CON_COMPLEMENTO',
        paymentComplementStatus: 'COMPLEMENTO_FUERA_DE_PERIODO',
        ivaCreditabilityStatus: 'ACREDITABLE',
        resultado: '🔴 NO USABLE',
        total: 4000,
      } as unknown as ValidationResult,
      // CFDI cancelado
      {
        uuid: 'UUID-CANCELADO',
        tipoCFDI: 'I',
        metodoPago: 'PUE',
        ivaTraslado: 50,
        isValid: true,
        estatusSAT: 'Cancelado',
        fiscalRiskLevel: 'VERDE',
        paymentMethodStatus: 'PUE_VALIDO',
        paymentComplementStatus: 'NO APLICA',
        ivaCreditabilityStatus: 'POR_DETERMINAR',
        resultado: '🔴 NO DISPONIBLE (CANCELADO)',
        total: 500,
      } as unknown as ValidationResult,
      // CFDI sin nivel de riesgo (para probar conteo)
      {
        uuid: 'UUID-SIN-RIESGO',
        tipoCFDI: 'I',
        metodoPago: 'PUE',
        ivaTraslado: 0,
        isValid: true,
        estatusSAT: 'Vigente',
        paymentMethodStatus: 'PUE_VALIDO',
        paymentComplementStatus: 'NO APLICA',
        ivaCreditabilityStatus: 'POR_DETERMINAR',
        resultado: '🟢 OK',
        total: 1000,
      } as unknown as ValidationResult,
    ];

    const company = { name: 'Empresa de prueba', rfc: 'EMP010101EMP' };
    const companyCfdis = cfdis.map(cfdi => ({
      ...cfdi,
      rfcEmisor: company.rfc,
      rfcReceptor: 'CLI010101CLI',
    }));
    const workbook = await buildMainReportWorkbook(companyCfdis, company);
    
    // Verificar que Resumen sea la primera hoja
    expect(workbook.SheetNames[0]).toBe('Resumen');

    // Leer los datos de la hoja Resumen
    const ws = workbook.Sheets['Resumen'];
    const rows = XLSX.utils.sheet_to_json(ws) as any[];

    const emittedSection = rows.findIndex(row => row.Indicador === '=== CFDI EMITIDAS ===');
    const emittedMetrics = rows.slice(emittedSection + 1, rows.findIndex((row, index) =>
      index > emittedSection && String(row.Indicador).startsWith('=== CFDI ')
    ));
    const getEmittedValue = (metricName: string) => emittedMetrics.find(row => row.Indicador === metricName)?.Valor;

    expect(rows.find(row => row.Indicador === 'Empresa')?.Valor).toBe(company.name);
    expect(getEmittedValue('Cantidad')).toBe(6);
    expect(getEmittedValue('Semáforo: Usables')).toBe(2);
    expect(getEmittedValue('Semáforo: Con alerta')).toBe(1);
    expect(getEmittedValue('Semáforo: No usables')).toBe(3);
    expect(getEmittedValue('Ingresos I (MXN, sin cancelados ni REP)')).toBe(11000);
    expect(getEmittedValue('Conciliación SAT: Vigente')).toBe(5);
    expect(getEmittedValue('Conciliación SAT: Cancelado')).toBe(1);
    expect(getEmittedValue('Conciliación SAT: Suma = total de CFDI')).toBe('CUADRA (6)');
    const alertRows = XLSX.utils.sheet_to_json(workbook.Sheets['Alertas']) as any[];
    const emittedUuids = new Set(companyCfdis.map(cfdi => cfdi.uuid));
    expect(getEmittedValue('Alertas (hoja Alertas)')).toBe(alertRows.filter(row => emittedUuids.has(row.UUID)).length);
    expect(getEmittedValue('Semáforo de riesgo')).toBe('ROJO');
  });
});
