import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import UploadZone, { type UploadedFile } from '../components/UploadZone';

// @ts-ignore
global.IS_REACT_ACT_ENVIRONMENT = true;

const waitFor = async (check: () => boolean) => {
  for (let i = 0; i < 100 && !check(); i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  expect(check()).toBe(true);
};

describe('UploadZone: ZIP y carpetas desde el selector', () => {
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

  it('abre el ZIP, lista sus XML y reporta el ZIP dañado sin detener la carga', async () => {
    const good = zipSync({ 'julio/a.xml': strToU8('<a/>'), 'julio/factura.pdf': strToU8('%PDF') });
    await select('xml-upload', [new File([good], 'descarga.zip'), new File([good.slice(0, 20)], 'roto.zip'), new File(['<s/>'], 'suelto.XML')]);
    await waitFor(() => container.textContent!.includes('1 ZIP abierto') && container.textContent!.includes('ZIP con error: roto.zip'));
    expect(container.textContent).toContain('descarga.zip/julio/a.xml');
    expect(container.textContent).toContain('1 archivo no XML (PDF, TXT…) ignorado');
    await waitFor(() => !container.querySelector<HTMLButtonElement>('button[disabled]'));
    await validate();
    expect(delivered!.map(f => [f.name, f.content]).sort()).toEqual([['descarga.zip/julio/a.xml', '<a/>'], ['suelto.XML', '<s/>']]);
  });

  it('el selector de carpeta conserva la ruta relativa e ignora lo que no es XML', async () => {
    const xml = new File(['<a/>'], 'a.xml');
    Object.defineProperty(xml, 'webkitRelativePath', { value: 'TVA/2026/07/a.xml' });
    const pdf = new File(['%PDF'], 'b.pdf');
    Object.defineProperty(pdf, 'webkitRelativePath', { value: 'TVA/2026/07/b.pdf' });
    await select('xml-folder-upload', [xml, pdf]);
    await waitFor(() => container.textContent!.includes('TVA/2026/07/a.xml'));
    expect(container.querySelector('#xml-folder-upload')!.hasAttribute('webkitdirectory')).toBe(true);
    expect(container.textContent).toContain('1 archivo no XML (PDF, TXT…) ignorado');
  });
});
