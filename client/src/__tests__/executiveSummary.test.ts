import { describe, expect, it } from 'vitest';
import { exportToExcel } from '../lib/excelExporter';
import { ValidationResult } from '../lib/cfdiEngine';
import * as XLSX from 'xlsx';
import * as fs from 'fs';

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

    const outputPath = 'dev-outputs/sentinel_test_summary_test.xlsx';
    
    // Si existe el archivo, borrarlo para asegurar una prueba limpia
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    await exportToExcel(cfdis, outputPath);

    expect(fs.existsSync(outputPath)).toBe(true);

    const workbook = XLSX.readFile(outputPath);
    
    // Verificar que Resumen sea la primera hoja
    expect(workbook.SheetNames[0]).toBe('Resumen');

    // Leer los datos de la hoja Resumen
    const ws = workbook.Sheets['Resumen'];
    const rows = XLSX.utils.sheet_to_json(ws) as any[];

    console.log('Métricas en la hoja Resumen generada:', rows);

    const getVal = (metricName: string) => {
      const match = rows.find(r => r.Metrica === metricName);
      return match ? match.Valor : undefined;
    };

    // 1. Resumen Operativo
    expect(getVal('CFDI procesados')).toBe(6);
    expect(getVal('Usables')).toBe(2); // Verde: UUID-VERDE-PUE and UUID-SIN-RIESGO
    expect(getVal('Alertas')).toBe(1);  // Amarillo: UUID-AMARILLO-PUE
    expect(getVal('No usables')).toBe(3); // Rojo: PPD-SIN, PPD-FUERA, CANCELADO
    expect(getVal('Monto total')).toBe(11500);
    expect(getVal('Monto en riesgo')).toBe(9500); // 2000 (Amarillo) + 3000 (Rojo) + 4000 (Rojo) + 500 (Rojo - Cancelado)
    expect(getVal('Cancelados')).toBe(1);

    // 2. Semáforo Fiscal Preventivo
    expect(getVal('CFDI sin riesgo fiscal preventivo')).toBe(2);
    expect(getVal('CFDI con revisión fiscal preventiva')).toBe(1);
    expect(getVal('CFDI con riesgo fiscal preventivo')).toBe(2);
    expect(getVal('PPD sin complemento')).toBe(1);
    expect(getVal('PUE revisar cobro')).toBe(1);
    expect(getVal('Complementos fuera de periodo')).toBe(1);
    expect(getVal('UUID relacionado no encontrado')).toBe(0);
    expect(getVal('IVA potencialmente no acreditable')).toBe(300);
    expect(getVal('IVA acreditable')).toBe(700);
    expect(getVal('IVA en revisión')).toBe(250);

    // Limpieza
    fs.unlinkSync(outputPath);
  });
});
