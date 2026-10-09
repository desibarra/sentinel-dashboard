import { afterEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { unzipSync, strFromU8 } from 'fflate';
import type { ValidationResult } from '../lib/cfdiEngine';
import {
  buildTechnicalAnnexZip,
  exportCompleteTechnicalAnnexZip,
  exportSingleCfdiTechnicalAnnex,
  exportTechnicalAnnex,
  isTechnicalAnnexRelevant,
} from '../lib/excelExporter';

vi.mock('xlsx', async importOriginal => {
  const actual = await importOriginal<typeof import('xlsx')>();
  return { ...actual, writeFile: vi.fn() };
});

function fixture(index: number, status = '🟢 USABLE'): ValidationResult {
  const concepts = Array.from({ length: 10 }, (_, conceptIndex) => ({
    cantidad: 1,
    valorUnitario: 100 + conceptIndex,
    importe: 100 + conceptIndex,
    descuento: 0,
    objetoImp: '02',
    claveProdServ: '01010101',
    descripcion: `Concepto ${conceptIndex + 1} del CFDI ${index}`,
    traslados: [],
    retenciones: [],
  }));
  const xmlContent = '<Comprobante Version="4.0"><Emisor Rfc="EMI010101AAA"/><Receptor Rfc="REC010101AAA"/></Comprobante>';
  return {
    fileName: `cfdi-${index}.xml`,
    uuid: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    versionCFDI: '4.0',
    tipoCFDI: 'I',
    fechaEmision: '2026-10-01',
    rfcEmisor: 'EMI010101AAA',
    rfcReceptor: 'REC010101AAA',
    resultado: status,
    xmlContent,
    desglosePorConcepto: concepts,
  } as unknown as ValidationResult;
}

afterEach(() => vi.restoreAllMocks());

describe('anexos técnicos', () => {
  it('limita el anexo técnico por defecto a alertas y CFDI no usables', async () => {
    const relevant = [fixture(1, '🟡 ALERTA'), fixture(2, '🔴 NO USABLE')];
    const normal = fixture(3);

    expect(isTechnicalAnnexRelevant(relevant[0])).toBe(true);
    expect(isTechnicalAnnexRelevant(relevant[1])).toBe(true);
    expect(isTechnicalAnnexRelevant(normal)).toBe(false);

    vi.mocked(XLSX.writeFile).mockClear();
    await exportTechnicalAnnex([...relevant, normal]);
    const workbook = vi.mocked(XLSX.writeFile).mock.calls[0][0];
    const conceptRows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets['DETALLE CONCEPTOS XML']);

    expect(conceptRows).toHaveLength(20);
    expect(conceptRows.every(row => String(row.UUID).endsWith('000000000001') || String(row.UUID).endsWith('000000000002'))).toBe(true);
  });

  it('permite descargar el anexo individual aunque el CFDI no tenga alerta', async () => {
    vi.mocked(XLSX.writeFile).mockClear();
    await exportSingleCfdiTechnicalAnnex(fixture(4));
    const workbook = vi.mocked(XLSX.writeFile).mock.calls[0][0];
    const conceptRows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets['DETALLE CONCEPTOS XML']);

    expect(conceptRows).toHaveLength(10);
    expect(conceptRows.every(row => String(row.UUID).endsWith('000000000004'))).toBe(true);
  });

  it('identifica la hoja y el motivo cuando falla la extracción de conceptos', async () => {
    const malformed = fixture(7, '🟡 ALERTA');
    malformed.desglosePorConcepto = [null] as unknown as ValidationResult['desglosePorConcepto'];
    await expect(exportTechnicalAnnex([malformed])).rejects.toThrow(/Falló la hoja "DETALLE CONCEPTOS XML":/);
  });

  it('genera ZIP por partes con CSV de las cinco hojas para 4,000 CFDI × 10 conceptos', async () => {
    const batch = Array.from({ length: 4_000 }, (_, index) => fixture(index + 1));
    const archive = await buildTechnicalAnnexZip(batch);
    const zipped = unzipSync(new Uint8Array(Buffer.concat(archive.chunks.map(chunk => Buffer.from(chunk)))));
    const conceptCsv = strFromU8(zipped['DETALLE CONCEPTOS XML.csv']);
    const conceptLines = conceptCsv.trimEnd().split(/\r\n/);

    expect(Object.keys(zipped).sort()).toEqual([
      'DETALLE CARTA PORTE FIGURAS.csv',
      'DETALLE CARTA PORTE MERCANCIAS.csv',
      'DETALLE CONCEPTOS XML.csv',
      'DETALLE CP UBICACIONES.csv',
      'EXTRACCION CRUDA XML.csv',
    ]);
    expect(conceptLines).toHaveLength(40_001);
    expect(archive.byteLength).toBeGreaterThan(0);
    console.info(`[technical annex benchmark] 4000 CFDI × 10 conceptos: ${(archive.elapsedMs / 1000).toFixed(2)}s, ${(archive.byteLength / 1024 / 1024).toFixed(2)} MB ZIP`);
  }, 120_000);

  it('si no hay hojas asociadas, incluye sus cabeceras y mantiene un ZIP válido', async () => {
    const archive = await buildTechnicalAnnexZip([fixture(5)]);
    const zipped = unzipSync(new Uint8Array(Buffer.concat(archive.chunks.map(chunk => Buffer.from(chunk)))));
    expect(strFromU8(zipped['DETALLE CARTA PORTE MERCANCIAS.csv'])).toContain('Estado');
  });

  it('escribe los fragmentos ZIP directamente al destino elegido sin acumular el archivo completo', async () => {
    const writtenChunks: Uint8Array[] = [];
    let closed = false;
    const originalPicker = (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker;
    (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker = async () => ({
      createWritable: async () => ({
        write: async (chunk: Uint8Array) => { writtenChunks.push(chunk); },
        close: async () => { closed = true; },
      }),
    });
    try {
      const metrics = await exportCompleteTechnicalAnnexZip([fixture(6)]);
      expect(metrics.byteLength).toBe(writtenChunks.reduce((total, chunk) => total + chunk.byteLength, 0));
      expect(writtenChunks.length).toBeGreaterThan(1);
      expect(closed).toBe(true);
      const zipped = unzipSync(new Uint8Array(Buffer.concat(writtenChunks.map(chunk => Buffer.from(chunk)))));
      expect(strFromU8(zipped['DETALLE CONCEPTOS XML.csv'])).toContain('Concepto 10 del CFDI 6');
    } finally {
      (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker = originalPicker;
    }
  }, 30_000);
});
