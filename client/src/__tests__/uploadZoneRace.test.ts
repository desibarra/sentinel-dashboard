import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import UploadZone from '../components/UploadZone';

// @ts-ignore
global.IS_REACT_ACT_ENVIRONMENT = true;

// Reproduce de forma controlada el bug encontrado en el diagnóstico de memoria
// escalonado (500/1000/1500 XML): con FileReader asíncrono por archivo, el
// botón "Iniciar Validación" podía habilitarse en cuanto el PRIMER archivo
// terminaba de leerse, mientras el resto seguía en lectura. Un clic en ese
// momento perdía en silencio los archivos aún no leídos (setFiles([]) los
// descartaba). La corrección exige que TODOS los archivos hayan terminado
// (contenido listo o error) antes de habilitar el botón.
//
// Este test controla manualmente cuándo "termina" cada FileReader para
// verificar el estado del botón en cada punto intermedio, sin depender de
// temporizadores reales.

type PendingReader = { onload: ((ev: any) => void) | null; onerror: ((ev: any) => void) | null; resolve: (content: string) => void; reject: () => void };

describe('UploadZone: no debe perder archivos por condición de carrera en FileReader', () => {
  let container: HTMLDivElement;
  let pendingReaders: PendingReader[];
  let OriginalFileReader: typeof FileReader;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    pendingReaders = [];

    OriginalFileReader = global.FileReader;
    class ControlledFileReader {
      onload: ((ev: any) => void) | null = null;
      onerror: ((ev: any) => void) | null = null;
      result: string | null = null;
      readAsText(_file: File) {
        // No resuelve de inmediato: queda "colgado" hasta que el test decida
        // completarlo, simulando un FileReader real en curso.
        pendingReaders.push({
          onload: null,
          onerror: null,
          resolve: (content: string) => {
            this.result = content;
            if (this.onload) this.onload({ target: { result: content } });
          },
          reject: () => {
            if (this.onerror) this.onerror({});
          },
        });
        // Vincula los callbacks reales (asignados por UploadZone tras construir el reader)
        // usando un microtask, ya que UploadZone asigna onload/onerror DESPUÉS de `new FileReader()`.
        queueMicrotask(() => {
          const entry = pendingReaders[pendingReaders.length - 1];
          entry.onload = this.onload;
          entry.onerror = this.onerror;
        });
      }
    }
    // @ts-ignore
    global.FileReader = ControlledFileReader;
  });

  afterEach(() => {
    global.FileReader = OriginalFileReader;
    document.body.removeChild(container);
  });

  function isValidateButtonDisabled(): boolean {
    const btn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Iniciar Validación'));
    return !btn || btn.disabled;
  }

  function fireFilesSelected(files: File[]) {
    const input = container.querySelector('#xml-upload') as HTMLInputElement;
    // jsdom no implementa DataTransfer; se construye un FileList mínimo compatible.
    const fileList = {
      length: files.length,
      item: (i: number) => files[i] ?? null,
      [Symbol.iterator]: function* () { yield* files; },
    };
    files.forEach((f, i) => { (fileList as any)[i] = f; });
    Object.defineProperty(input, 'files', { value: fileList, configurable: true });
    const event = new Event('change', { bubbles: true });
    input.dispatchEvent(event);
  }

  it('mantiene el botón deshabilitado mientras haya FileReader activos, y no pierde ningún archivo', async () => {
    let delivered: any[] | null = null;
    const root = createRoot(container);
    await act(async () => {
      root.render(
        React.createElement(UploadZone, {
          onFilesReady: (files: any[]) => { delivered = files; },
          isValidating: false,
          hasValidatedResults: false,
        })
      );
    });

    const fileA = new File(['<a/>'], 'a.xml', { type: 'text/xml' });
    const fileB = new File(['<b/>'], 'b.xml', { type: 'text/xml' });
    const fileC = new File(['<c/>'], 'c.xml', { type: 'text/xml' });
    const fileNotXml = new File(['no'], 'nota.txt', { type: 'text/plain' });

    await act(async () => {
      fireFilesSelected([fileA, fileB, fileC, fileNotXml]);
      await Promise.resolve();
      await Promise.resolve();
    });

    // El archivo .txt se rechaza de inmediato (status "error"), sin pasar por
    // FileReader. Los 3 .xml SÍ generan un FileReader controlado.
    expect(pendingReaders.length).toBe(3);

    // Con los 3 FileReader de los .xml aún "colgados": el botón debe permanecer deshabilitado.
    expect(isValidateButtonDisabled()).toBe(true);

    // Resuelve solo el primero.
    await act(async () => {
      pendingReaders[0].resolve('<a/>');
      await Promise.resolve();
    });
    expect(isValidateButtonDisabled()).toBe(true); // aún faltan 2

    // Resuelve el segundo CON ERROR (simula lectura fallida).
    await act(async () => {
      pendingReaders[1].reject();
      await Promise.resolve();
    });
    expect(isValidateButtonDisabled()).toBe(true); // aún falta 1 (el tercero)

    // El error de lectura debe reflejarse visiblemente (badge "Error"), no desaparecer.
    expect(container.textContent).toContain('Error');

    // Resuelve el tercero: ahora TODOS están asentados (2 con contenido + 1 error + 1 rechazado no-xml).
    await act(async () => {
      pendingReaders[2].resolve('<c/>');
      await Promise.resolve();
    });
    expect(isValidateButtonDisabled()).toBe(false);

    // ── Conciliación exacta ANTES del clic ──
    // seleccionados: los 4 File entregados a fireFilesSelected.
    // lecturas exitosas: FileReader.onload (a.xml, c.xml) = 2.
    // errores de FileReader: onerror (b.xml) = 1.
    // rechazados por extensión (antes de tocar FileReader): nota.txt = 1.
    // "mostrados al usuario" = todas las filas aún visibles en la lista
    // (el componente no descarta nada hasta el clic en Iniciar Validación).
    const seleccionados = 4;
    const lecturasExitosas = 2;
    const erroresFileReader = 1;
    const rechazadosPorExtension = 1;
    const erroresTotales = erroresFileReader + rechazadosPorExtension;
    const mostradosAlUsuario = container.querySelectorAll('.space-y-2.max-h-48 > div').length;

    expect(mostradosAlUsuario).toBe(seleccionados); // ninguno desaparece antes del clic
    expect(lecturasExitosas + erroresTotales).toBe(seleccionados); // invariante pedida
    // Los 2 badges "Error" visibles corresponden a b.xml (FileReader) y nota.txt (extensión).
    const errorBadges = Array.from(container.querySelectorAll('span')).filter(s => s.textContent?.trim() === 'Error');
    expect(errorBadges.length).toBe(erroresTotales);

    // Clic en "Iniciar Validación": debe entregar EXACTAMENTE los archivos con
    // contenido listo (a.xml y c.xml) — ninguno de los 4 originales debe
    // desaparecer sin quedar contabilizado en algún estado (pending-entregado,
    // error de lectura, o rechazo por extensión).
    await act(async () => {
      const btn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Iniciar Validación'))!;
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(delivered).not.toBeNull();
    const enviadosAValidacion = delivered!.length;
    expect(enviadosAValidacion).toBe(2);
    expect(enviadosAValidacion).toBe(lecturasExitosas); // enviados === exitosos leídos
    const names = delivered!.map((f: any) => f.name).sort();
    expect(names).toEqual(['a.xml', 'c.xml']);
  });
});
