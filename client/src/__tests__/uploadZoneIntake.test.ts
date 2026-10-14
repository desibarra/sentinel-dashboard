import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import UploadZone, { type UploadedFile } from '../components/UploadZone';

// @ts-ignore
global.IS_REACT_ACT_ENVIRONMENT = true;

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const cfdi = (n: number) => `﻿<?xml version="1.0" encoding="UTF-8"?><cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"><cfdi:Complemento><tfd:TimbreFiscalDigital Version="1.1" UUID="${uuid(n)}"/></cfdi:Complemento></cfdi:Comprobante>`;
const withPath = (file: File, path: string) => { Object.defineProperty(file, 'webkitRelativePath', { value: path }); return file; };

const waitFor = async (check: () => boolean) => {
  for (let i = 0; i < 200 && !check(); i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  expect(check()).toBe(true);
};

describe('UploadZone: carpetas, ZIP, duplicados y resumen de carga', () => {
  let container: HTMLDivElement;
  let root: Root;
  let delivered: UploadedFile[] | null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    delivered = null;
    act(() => root.render(React.createElement(UploadZone, { onFilesReady: (files: UploadedFile[]) => { delivered = files; }, isValidating: false, hasValidatedResults: false })));
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  const select = (inputId: string, files: File[]) => act(async () => {
    const input = container.querySelector<HTMLInputElement>(`#${inputId}`)!;
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const validate = () => act(async () => {
    Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Iniciar Validación'))!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  const summary = () => Object.fromEntries(Array.from(container.querySelectorAll('[data-testid="intake-summary"] dl > div'))
    .map(div => [div.querySelector('dt')!.textContent, Number(div.querySelector('dd')!.textContent!.replace(/,/g, ''))]));
  const ready = () => {
    const button = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Iniciar Validación'));
    return Boolean(button && !button.disabled);
  };

  it('carpeta de 3 niveles + ZIP con subcarpetas: cuenta una vez el CFDI repetido, ignora PDF/TXT y reporta lo corrupto', async () => {
    const zip = zipSync({
      'descarga/2026/07/c.xml': strToU8(cfdi(3)),
      'descarga/2026/07/repetido.xml': strToU8(cfdi(1)), // mismo UUID que la carpeta
      'descarga/leeme.txt': strToU8('hola'),
      'interno.zip': zipSync({ 'd.xml': strToU8(cfdi(4)) }),
    });
    await select('xml-folder-upload', [
      withPath(new File([cfdi(1)], 'a.xml'), 'TVA/2026/07/emitidos/a.xml'),
      withPath(new File([cfdi(2)], 'B.XML'), 'TVA/2026/07/recibidos/B.XML'),
      withPath(new File(['<cfdi:Comprobante><roto'], 'corrupto.xml'), 'TVA/2026/corrupto.xml'),
      withPath(new File(['%PDF'], 'factura.pdf'), 'TVA/2026/factura.pdf'),
      withPath(new File(['notas'], 'notas.txt'), 'TVA/notas.txt'),
      withPath(new File([zip], 'sat.zip'), 'TVA/sat.zip'),
      withPath(new File([zip.slice(0, 25)], 'roto.zip'), 'TVA/roto.zip'),
    ]);
    await waitFor(() => ready() && summary()['ZIP abiertos'] === 2);

    expect(summary()).toEqual({
      'Archivos encontrados': 12, // 7 en la carpeta (2 ZIP) + 5 dentro de sat.zip (c.xml, repetido.xml, leeme.txt, interno.zip y su d.xml)
      'XML válidos': 4,
      'Duplicados omitidos (mismo UUID)': 1,
      'No-XML ignorados': 3,
      'XML con error de lectura': 1,
      'ZIP abiertos': 2,
      'ZIP con error': 1,
    });
    const text = container.textContent!;
    expect(text).toContain('Error de lectura: TVA/2026/corrupto.xml — XML mal formado o incompleto');
    expect(text).toContain('ZIP con error: TVA/roto.zip');
    expect(text).toMatch(/Duplicado omitido: (TVA\/2026\/07\/emitidos\/a\.xml|TVA\/sat\.zip\/descarga\/2026\/07\/repetido\.xml)/);

    await validate();
    // El corrupto se envía igual para que figure en "Errores de lectura" del reporte; el duplicado no.
    expect(delivered!.map(f => f.uuid || 'SIN UUID').sort()).toEqual([uuid(1), uuid(2), uuid(3), uuid(4), 'SIN UUID'].sort());
    expect(delivered!.every(f => !f.content!.startsWith('﻿'))).toBe(true); // BOM retirado
    // El resumen sigue visible después de validar.
    expect(summary()['XML válidos']).toBe(4);
  });

  it('deduplica contra lo ya seleccionado en una segunda selección y reinicia tras validar', async () => {
    await select('xml-upload', [new File([cfdi(1)], 'a.xml')]);
    await waitFor(ready);
    await select('xml-upload', [new File([cfdi(1)], 'copia.xml'), new File([cfdi(2)], 'b.xml')]);
    await waitFor(() => summary()['Archivos encontrados'] === 3 && ready());
    expect(summary()['Duplicados omitidos (mismo UUID)']).toBe(1);
    await validate();
    expect(delivered).toHaveLength(2);

    // Nueva selección después de validar: resumen nuevo.
    await select('xml-upload', [new File([cfdi(1)], 'otra-vez.xml')]);
    await waitFor(() => summary()['Archivos encontrados'] === 1 && ready());
    expect(summary()['XML válidos']).toBe(1);
  });

  it('muestra solo las primeras 200 filas con lotes grandes y procesa todos', async () => {
    const many = Array.from({ length: 450 }, (_, i) => new File([cfdi(i + 1)], `f${i}.xml`));
    await select('xml-upload', many);
    await waitFor(() => ready() && summary()['XML válidos'] === 450);
    expect(container.querySelectorAll('.space-y-2.max-h-48 > div')).toHaveLength(200);
    expect(container.textContent).toContain('Se muestran los primeros 200 de 450 XML');
    await validate();
    expect(delivered).toHaveLength(450);
  });
});
